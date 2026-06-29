import re

def validate_sql(sql: str) -> tuple[bool, str]:
    """
    Validates the generated SQL to ensure it is safe to execute.
    Returns a tuple (is_valid: bool, error_message: str).
    """
    if not sql:
        return False, "SQL query is empty."

    # Remove comments and leading/trailing whitespace
    clean_sql = re.sub(r'--.*', '', sql).strip()
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL).strip()
    
    # Must start with SELECT
    if not clean_sql.upper().startswith("SELECT"):
        return False, "Only SELECT queries are allowed."

    # Check for forbidden keywords
    forbidden_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", 
        "CREATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "REPLACE"
    ]
    
    # Use word boundary \b to prevent matching parts of column names
    for keyword in forbidden_keywords:
        if re.search(rf'\b{keyword}\b', clean_sql, re.IGNORECASE):
            return False, f"Forbidden SQL keyword detected: {keyword}"

    # Verify no multiple statements (e.g. SELECT * FROM table; DROP TABLE other_table;)
    # A safe query should have at most one semicolon at the end
    statements = [stmt.strip() for stmt in clean_sql.split(';') if stmt.strip()]
    if len(statements) > 1:
        return False, "Multiple SQL statements are not allowed."

    return True, ""
