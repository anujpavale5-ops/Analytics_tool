import logging
from app.sql_template_engine import build_sql
from app.v7_validation_engine import validate_and_repair_sql
from app.query_planner import QueryPlanner

def generate_and_validate_sql_loop(intent: dict, schema: dict) -> dict:
    """
    Self-Healing Analytics Loop:
    Validate -> Repair -> Revalidate -> Execute
    """
    confidence = intent.get("confidence", 0)
    
    # 1. Clarification Engine Check
    if confidence < 70:
        return {
            "success": False, 
            "error": _generate_clarification(intent),
            "sql": "",
            "confidence": confidence
        }
    
    # 2. Build deterministic SQL
    try:
        sql = build_sql(intent, schema)
    except Exception as e:
        return {"success": False, "error": f"SQL Generation crashed: {str(e)}", "sql": "", "confidence": confidence}
        
    # 3. Validate & Auto-Repair (Self-Healing)
    val_res = validate_and_repair_sql(intent, sql)
    
    if val_res["repaired"]:
        # Re-validate repaired SQL
        sql = val_res["sql"]
        val_res = validate_and_repair_sql(intent, sql)
        if not val_res["valid"] and not val_res["repaired"]:
            return {"success": False, "error": "Auto-repair failed. Invalid SQL structure.", "sql": sql, "confidence": confidence}
            
        # Penalize confidence slightly because we had to repair
        confidence = max(70, confidence - 10)
        
    # 4. Confidence execution logic
    if confidence >= 90:
        return {"success": True, "sql": sql, "confidence": confidence, "message": "Executed automatically."}
    elif confidence >= 70:
        return {"success": True, "sql": sql, "confidence": confidence, "message": "Repaired and executed with caution."}
    else:
        return {"success": False, "error": _generate_clarification(intent), "sql": sql, "confidence": confidence}

def _generate_clarification(intent: dict) -> str:
    """
    Clarification Engine: Provides specific questions rather than generic errors.
    """
    intent_type = intent.get("intent_type")
    has_metric = len(intent.get("metrics", [])) > 0
    has_group = len(intent.get("group_by", [])) > 0
    
    if intent_type == "Trend" and not has_group:
        return "Which date column should I use for the trend analysis (e.g., created_at, order_date)?"
        
    if not has_metric:
        if has_group:
            dim = intent["group_by"][0]
            return f"What metric would you like to calculate for each {dim}? (e.g., Total Revenue, Average Salary, Count of Records)"
        return "Did you mean: Total Revenue, Average Value, or Maximum Amount?"
        
    if not has_group and intent_type in ["Group By", "Ranking", "Distribution"]:
        metric = intent["metrics"][0].get("column", "records")
        return f"Which identifier should be used to group the {metric}? (e.g., customer_name, department_id)"
        
    return "Could you rephrase your question with a specific metric and dimension? (e.g., 'Total Sales by Region')"
