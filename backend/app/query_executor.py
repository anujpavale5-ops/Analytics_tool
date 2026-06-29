from app.database import fetch_data
from app.sql_validator import validate_sql
import sqlite3
import time

def execute_generated_sql(project_id: str, sql: str) -> dict:
    """
    Validates and executes a SQL query, returning the results and columns.
    """
    is_valid, error_msg = validate_sql(sql)
    
    if not is_valid:
        return {
            "success": False,
            "error": f"Validation Error: {error_msg}",
            "data": [],
            "columns": []
        }

    try:
        start_time = time.time()
        data = fetch_data(project_id, sql)
        execution_time = round((time.time() - start_time) * 1000) # ms
        
        columns = list(data[0].keys()) if data else []
        return {
            "success": True,
            "data": data,
            "columns": columns,
            "execution_time_ms": execution_time,
            "row_count": len(data),
            "error": None
        }
    except sqlite3.Error as e:
        return {
            "success": False,
            "error": f"Database Error: {str(e)}",
            "data": [],
            "columns": []
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Execution Error: {str(e)}",
            "data": [],
            "columns": []
        }
