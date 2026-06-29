import re
import json

class SchemaMatcher:
    """
    Analyzes the uploaded schema to automatically identify column roles.
    """
    @staticmethod
    def identify_roles(schema: dict) -> dict:
        matched = {}
        for table, metadata in schema.items():
            roles = {
                "primary_keys": [],
                "foreign_keys": [],
                "numeric": [],
                "categorical": [],
                "date": [],
                "text": []
            }
            columns = metadata.get("columns", [])
            for col in columns:
                name = col.get("name", "").lower()
                dtype = col.get("type", "").lower()
                
                # Primary Key inference
                if name == "id" or name.endswith("_id") and table.lower().startswith(name.split('_id')[0]):
                    roles["primary_keys"].append(name)
                # Foreign Key inference
                elif name.endswith("_id"):
                    roles["foreign_keys"].append(name)
                
                # Data Type inference
                if "int" in dtype or "float" in dtype or "numeric" in dtype or "double" in dtype or "decimal" in dtype:
                    if name not in roles["primary_keys"] and name not in roles["foreign_keys"]:
                        roles["numeric"].append(name)
                    else:
                        roles["categorical"].append(name)
                elif "date" in dtype or "time" in dtype:
                    roles["date"].append(name)
                else:
                    roles["text"].append(name)
                    # Simple heuristic: if it's text, it's categorical
                    roles["categorical"].append(name)
                    
            matched[table] = roles
        return matched

class ColumnAliasEngine:
    """
    Automatically generates descriptive aliases for columns and metrics.
    """
    @staticmethod
    def generate_alias(column: str, aggregation: str = None) -> str:
        # Strip common prefixes/suffixes
        clean = re.sub(r'^(emp_|employee_|tbl_|fact_|dim_|master_|ref_|data_)', '', column.lower())
        
        # Replace common poorly named metrics
        synonyms = {
            "total_amount": "revenue",
            "amount": "total",
            "qty": "quantity",
            "dt": "date",
            "val": "value"
        }
        
        for k, v in synonyms.items():
            if clean == k:
                clean = v
                break
                
        if aggregation and aggregation.upper() != "RAW":
            agg = aggregation.lower()
            if agg == "count" and clean == "*":
                return "total_records"
            if agg == "sum":
                return f"total_{clean}"
            if agg == "avg":
                return f"average_{clean}"
            return f"{agg}_{clean}"
            
        return clean

class QueryPlanner:
    """
    Generates a deterministic logical query plan from the intent.
    """
    @staticmethod
    def build_plan(intent: dict, schema: dict) -> dict:
        table = intent.get("table")
        if not table and schema:
            table = list(schema.keys())[0]
            
        metrics = intent.get("metrics", [])
        dimensions = intent.get("group_by", [])
        filters = intent.get("filters", [])
        sort = intent.get("sort")
        limit = intent.get("limit")
        
        # Auto-apply LIMIT for ranking keywords
        q = intent.get("original_question", "").lower()
        ranking_keywords = ["highest", "lowest", "top", "bottom", "best", "worst", "maximum", "minimum"]
        if any(k in q for k in ranking_keywords) and not limit:
            limit = 10 if "top 10" in q or "bottom 10" in q else (5 if "top 5" in q or "bottom 5" in q else 1)

        plan = {
            "table": table,
            "metrics": [],
            "dimensions": [],
            "filters": filters,
            "sort": sort,
            "limit": limit
        }
        
        # Process dimensions (group by)
        for dim in dimensions:
            plan["dimensions"].append({
                "column": dim,
                "alias": ColumnAliasEngine.generate_alias(dim)
            })
            
        # Process metrics
        for m in metrics:
            col = m.get("column", "*")
            agg = m.get("aggregation", "RAW")
            plan["metrics"].append({
                "column": col,
                "aggregation": agg,
                "alias": ColumnAliasEngine.generate_alias(col, agg)
            })
            
        return plan
