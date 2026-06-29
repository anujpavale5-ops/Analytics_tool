import re
import pandas as pd

def validate_and_repair_sql(intent: dict, sql: str) -> dict:
    """
    Validates SQL and attempts automatic repair for common issues.
    """
    sql_upper = sql.upper()
    repaired_sql = sql
    
    # 1. GROUP BY Validation & Repair
    # If there is an aggregate function (SUM, AVG, COUNT, MAX, MIN) and non-aggregate columns, ensure GROUP BY exists.
    has_agg = any(agg in sql_upper for agg in ["SUM(", "AVG(", "COUNT(", "MAX(", "MIN("])
    
    if has_agg and "GROUP BY" not in sql_upper:
        # Check if there are non-aggregated columns in SELECT
        select_match = re.search(r'SELECT\s+(.*?)\s+FROM', sql, re.IGNORECASE | re.DOTALL)
        if select_match:
            select_cols = select_match.group(1).split(',')
            non_agg_cols = []
            for col in select_cols:
                if not any(agg in col.upper() for agg in ["SUM(", "AVG(", "COUNT(", "MAX(", "MIN("]):
                    # It's a non-aggregated column
                    match = re.search(r'"([^"]+)"', col)
                    if match:
                        non_agg_cols.append(match.group(1))
                        
            if non_agg_cols:
                # Repair: Append GROUP BY before ORDER BY or LIMIT
                gb_clause = " GROUP BY " + ", ".join([f'"{c}"' for c in non_agg_cols])
                if "ORDER BY" in sql_upper:
                    repaired_sql = re.sub(r'(?i)(ORDER BY)', gb_clause + r' \1', repaired_sql)
                elif "LIMIT" in sql_upper:
                    repaired_sql = re.sub(r'(?i)(LIMIT)', gb_clause + r' \1', repaired_sql)
                else:
                    repaired_sql = repaired_sql.rstrip(';') + gb_clause + ";"
                    
    # 2. ORDER BY Validation & Repair
    # Never allow ORDER BY raw_column when metric is aggregated
    order_match = re.search(r'ORDER BY\s+([^A-Z]*"([^"]+)"[^A-Z]*)', repaired_sql, re.IGNORECASE)
    if order_match and has_agg:
        raw_col = order_match.group(2)
        # Check if the raw col is actually an alias from the select statement
        is_alias = False
        select_match = re.search(r'SELECT\s+(.*?)\s+FROM', repaired_sql, re.IGNORECASE | re.DOTALL)
        if select_match:
            # Simple check if it's explicitly aliased
            if f'AS "{raw_col}"' in select_match.group(1):
                is_alias = True
                
        if not is_alias:
            # Repair: order by the first aggregate alias instead if we can find one, or just SUM
            metrics = intent.get("metrics", [])
            if metrics:
                agg = metrics[0].get("aggregation", "SUM").upper()
                new_order = f'ORDER BY {agg}("{raw_col}")'
                repaired_sql = repaired_sql.replace(order_match.group(1), new_order)
                
    # 3. LIMIT Validation & Repair
    q = intent.get("original_question", "").lower()
    ranking_keywords = ["highest", "lowest", "top", "bottom", "best", "worst", "maximum", "minimum"]
    if any(k in q for k in ranking_keywords):
        if "LIMIT" not in repaired_sql.upper():
            # Auto append LIMIT
            limit = 10 if "top 10" in q or "bottom 10" in q else (5 if "top 5" in q or "bottom 5" in q else 1)
            repaired_sql = repaired_sql.rstrip(';') + f" LIMIT {limit};"

    # Evaluate validation success
    if sql != repaired_sql:
        return {"valid": False, "repaired": True, "sql": repaired_sql, "reason": "Auto-repaired structural issues (GROUP BY / ORDER BY / LIMIT)."}
        
    return {"valid": True, "repaired": False, "sql": sql, "reason": ""}

def validate_results(intent: dict, data: list) -> dict:
    """
    Validates the shape of the result set post-execution.
    """
    if not data:
        return {"valid": True, "reason": ""}
        
    df = pd.DataFrame(data)
    num_rows = len(df)
    intent_type = intent.get("intent_type", "Raw")
    
    if intent_type == "Group By" and intent.get("group_by"):
        if num_rows == 1 and len(df.columns) == 1:
            return {"valid": False, "reason": "Result Validation Failed: Group By expected multiple columns, got single value."}
            
    if intent_type == "Ranking" and intent.get("group_by"):
        if len(df.columns) < 2:
            return {"valid": False, "reason": "Result Validation Failed: Ranking expected grouping column and metric, got single column."}
            
    return {"valid": True, "reason": ""}
