from app.query_planner import QueryPlanner

def build_sql(intent: dict, schema: dict = None) -> str:
    """
    Constructs deterministic PostgreSQL queries based on the logical query plan.
    """
    # 1. Generate Logical Query Plan
    plan = QueryPlanner.build_plan(intent, schema)
    
    table = plan.get("table")
    if not table: return ""
    
    metrics = plan.get("metrics", [])
    dimensions = plan.get("dimensions", [])
    filters = plan.get("filters", [])
    sort = plan.get("sort")
    limit = plan.get("limit")

    # 2. Build SELECT clause
    select_parts = []
    
    for dim in dimensions:
        col = dim["column"]
        alias = dim["alias"]
        select_parts.append(f'"{col}" AS "{alias}"')
        
    for m in metrics:
        col = m["column"]
        agg = m["aggregation"].upper()
        alias = m["alias"]
        
        if agg == "RAW":
            select_parts.append(f'"{col}" AS "{alias}"' if col != "*" else "*")
        elif agg == "DISTINCT_COUNT" or agg == "COUNT_DISTINCT":
            select_parts.append(f'COUNT(DISTINCT "{col}") AS "{alias}"')
        elif col == "*":
            select_parts.append(f'{agg}(*) AS "{alias}"')
        else:
            select_parts.append(f'{agg}("{col}") AS "{alias}"')
            
    if not select_parts:
        select_parts.append("*")
        
    select_clause = "SELECT " + ", ".join(select_parts)

    # 3. Build FROM clause
    from_clause = f'FROM "{table}"'

    # 4. Build WHERE clause
    where_clause = ""
    if filters and isinstance(filters, list):
        conditions = []
        for f in filters:
            col = f.get("column")
            op = f.get("operator", "=")
            val = f.get("value")
            
            if isinstance(val, str):
                val_clean = val.replace("'", "''")
                conditions.append(f'"{col}" {op} \'{val_clean}\'')
            elif val is not None:
                conditions.append(f'"{col}" {op} {val}')
        
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

    # 5. Build GROUP BY clause
    group_by_clause = ""
    if dimensions and metrics:
        # If there are metrics, we MUST group by all dimensions
        group_by_clause = "GROUP BY " + ", ".join([f'"{d["column"]}"' for d in dimensions])

    # 6. Build ORDER BY clause
    order_by_clause = ""
    if sort and isinstance(sort, dict):
        sort_col = sort.get("column")
        sort_dir = sort.get("direction", "ASC").upper()
        if sort_col:
            # Check if sort_col is a metric alias
            matched_metric = next((m for m in metrics if m["column"] == sort_col or m["alias"] == sort_col), None)
            if matched_metric:
                order_by_clause = f'ORDER BY "{matched_metric["alias"]}" {sort_dir}'
            else:
                matched_dim = next((d for d in dimensions if d["column"] == sort_col or d["alias"] == sort_col), None)
                if matched_dim:
                    order_by_clause = f'ORDER BY "{matched_dim["alias"]}" {sort_dir}'
                else:
                    order_by_clause = f'ORDER BY "{sort_col}" {sort_dir}'
                    
    if not order_by_clause and intent.get("intent_type") == "Ranking" and metrics:
        # Default sort for Ranking if unspecified (sort by first metric descending)
        order_by_clause = f'ORDER BY "{metrics[0]["alias"]}" DESC'
        
    if not order_by_clause and intent.get("intent_type") == "Trend" and dimensions:
        # Default sort for Trend (sort by first dimension ascending - which is usually date)
        order_by_clause = f'ORDER BY "{dimensions[0]["alias"]}" ASC'

    # 7. Build LIMIT clause
    limit_clause = ""
    if limit and isinstance(limit, int):
        limit_clause = f"LIMIT {limit}"
    elif not dimensions and not metrics:
        limit_clause = "LIMIT 100" # Default limit for raw data

    # 8. Assemble query
    parts = [select_clause, from_clause, where_clause, group_by_clause, order_by_clause, limit_clause]
    sql = " ".join([p for p in parts if p]).strip() + ";"
    
    return sql
