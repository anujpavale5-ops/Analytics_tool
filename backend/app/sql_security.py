import re

def validate_read_only_sql(sql: str) -> dict:
    """
    Validates that a SQL string only contains read-only SELECT operations.
    Blocks INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, EXEC, EXECUTE, PRAGMA.
    """
    sql_upper = sql.upper()
    
    # Check for forbidden keywords
    # Use regex boundaries to ensure we match whole words and not parts of column names
    forbidden_keywords = [
        r'\bINSERT\b', r'\bUPDATE\b', r'\bDELETE\b', r'\bDROP\b', 
        r'\bALTER\b', r'\bTRUNCATE\b', r'\bGRANT\b', r'\bREVOKE\b', 
        r'\bEXEC\b', r'\bEXECUTE\b', r'\bPRAGMA\b', r'\bMERGE\b',
        r'\bCREATE\b', r'\bREPLACE\b'
    ]
    
    for keyword in forbidden_keywords:
        if re.search(keyword, sql_upper):
            return {
                "valid": False, 
                "reason": f"Security Violation: SQL contains forbidden operation. Only SELECT queries are allowed."
            }
            
    # Check that it actually is a SELECT (or WITH ... SELECT)
    if not re.search(r'\bSELECT\b', sql_upper) and not re.search(r'\bWITH\b', sql_upper):
        return {
            "valid": False,
            "reason": "Security Violation: Query must be a SELECT statement."
        }
        
    return {"valid": True, "reason": ""}
