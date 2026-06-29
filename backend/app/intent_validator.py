def validate_intent(intent: dict, schema: dict) -> dict:
    """
    Validates the extracted intent against the actual database schema.
    Returns {"valid": True} or {"valid": False, "error": "reason"}.
    """
    if "error" in intent:
        return {"valid": False, "error": intent["error"]}

    table_name = intent.get("table")
    if not table_name:
        return {"valid": False, "error": "No table specified in intent."}
        
    if table_name not in schema:
        return {"valid": False, "error": f"Table '{table_name}' does not exist."}
        
    table_schema = schema[table_name]
    valid_columns = [col["name"] for col in table_schema]
    
    col = intent.get("column")
    if col and col not in valid_columns and col != "*":
        return {"valid": False, "error": f"Column '{col}' does not exist in table '{table_name}'."}
        
    group_by = intent.get("group_by")
    if group_by and group_by not in valid_columns:
        return {"valid": False, "error": f"Group by column '{group_by}' does not exist."}
        
    filters = intent.get("filters", [])
    if isinstance(filters, list):
        for f in filters:
            if f.get("column") not in valid_columns:
                return {"valid": False, "error": f"Filter column '{f.get('column')}' does not exist."}
                
    return {"valid": True}
