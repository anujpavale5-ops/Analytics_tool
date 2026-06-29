import pandas as pd
import sqlite3
import os
import re
from typing import Dict, Any
from sqlalchemy import create_engine
from app.database import get_db_connection, _get_project_schema_name, DATABASE_URL

def sanitize_name(name: str) -> str:
    """Sanitize column or table names to be safe for SQL and readability."""
    # Convert camelCase to snake_case
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', str(name))
    
    # Replace non-alphanumeric characters with underscores
    clean_name = re.sub(r'\W+', '_', name.strip()).lower()
    
    # Remove common technical prefixes/suffixes
    prefixes = ['emp_', 'employee_', 'tbl_', 'fact_', 'dim_', 'master_', 'ref_', 'data_']
    for p in prefixes:
        if clean_name.startswith(p):
            clean_name = clean_name[len(p):]
            
    # Ensure it doesn't start with a number
    if clean_name[0].isdigit():
        clean_name = f"col_{clean_name}"
    return clean_name

BUSINESS_DICTIONARY = {
    "salary": ["salary", "income", "pay", "wage", "compensation", "earnings", "remuneration"],
    "department": ["department", "team", "division", "business unit", "group"],
    "revenue": ["revenue", "sales", "turnover", "income", "amount", "total amount", "sales value", "net sales", "order value", "transaction value", "purchase amount"],
    "customer": ["customer", "client", "buyer", "consumer", "account holder", "account", "customer name"],
    "employee": ["employee", "staff", "worker", "associate", "personnel", "team member", "manager"],
    "product": ["product", "item", "sku", "inventory", "inventory item"],
    "amount": ["amount", "value", "total", "sum", "total amount"],
    "quantity": ["quantity", "qty", "count"],
    "date": ["date", "dt", "time", "timestamp"],
    "region": ["region", "zone", "territory", "area"]
}

def generate_semantic_index(columns: list) -> Dict[str, str]:
    """Generates an inverted index mapping alias words back to the actual column name."""
    semantic_index = {}
    for col in columns:
        # Base mapping (column name to itself, replacing underscores with spaces)
        clean_col_words = col.replace('_', ' ')
        semantic_index[clean_col_words] = col
        semantic_index[col] = col
        
        # Dictionary mapping
        for key, aliases in BUSINESS_DICTIONARY.items():
            if key in col or key in clean_col_words:
                for alias in aliases:
                    semantic_index[alias] = col
                    
        # Common abbreviation mapping
        if 'dept' in col: semantic_index['department'] = col
        if 'cust' in col: semantic_index['customer'] = col
        if 'prod' in col: semantic_index['product'] = col
        if 'amt' in col: semantic_index['amount'] = col
        if 'qty' in col: semantic_index['quantity'] = col
        if 'rev' in col: semantic_index['revenue'] = col
        
    return semantic_index

def process_file(project_id: str, file_path: str, filename: str) -> Dict[str, Any]:
    """
    Reads a CSV or Excel file, infers schema, sanitizes columns, 
    and saves it as a new table in the SQLite database.
    """
    # Determine table name from filename
    base_name = os.path.splitext(filename)[0]
    table_name = sanitize_name(base_name)
    
    # Read file using Pandas
    if filename.endswith('.csv'):
        df = pd.read_csv(file_path)
    elif filename.endswith('.xlsx'):
        df = pd.read_excel(file_path, engine='openpyxl')
    else:
        raise ValueError("Unsupported file format. Please upload CSV or XLSX.")
    
    # Sanitize column names
    df.columns = [sanitize_name(col) for col in df.columns]
    
    # Attempt to convert object columns to datetime if possible
    for col in df.columns:
        if df[col].dtype == 'object':
            try:
                # Try converting to datetime
                converted = pd.to_datetime(df[col])
                # Check if we actually converted strings to dates and not just numbers to dates
                if converted.notna().any():
                    df[col] = converted
            except:
                pass
                
    # Generate canonical schema and profiling
    schema = []
    profile_columns = {}
    
    total_rows = len(df)
    total_nulls = 0
    
    for col in df.columns:
        dtype = df[col].dtype
        null_count = int(df[col].isnull().sum())
        total_nulls += null_count
        unique_count = int(df[col].nunique())
        
        col_name_lower = col.lower()
        is_identifier = False
        
        if "id" in col_name_lower.split("_") or "uuid" in col_name_lower or "key" in col_name_lower or "code" in col_name_lower:
            is_identifier = True
        elif unique_count > 0 and total_rows > 50 and unique_count >= total_rows * 0.95:
            is_identifier = True
            
        if pd.api.types.is_bool_dtype(dtype):
            canonical_type = "boolean"
            col_class = "Category" if not is_identifier else "Identifier"
        elif is_identifier:
            col_class = "Identifier"
            canonical_type = "number" if pd.api.types.is_numeric_dtype(dtype) else "text"
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            canonical_type = "date"
            col_class = "Date"
        elif pd.api.types.is_numeric_dtype(dtype):
            canonical_type = "number"
            if unique_count < 20 and unique_count < total_rows * 0.8:
                col_class = "Category"
            else:
                col_class = "Measure"
        else:
            canonical_type = "text"
            if unique_count < 20 and unique_count < total_rows * 0.8:
                col_class = "Category"
            else:
                # Check for PERSON/ENTITY
                entity_keywords = ["name", "customer", "client", "buyer", "employee", "user", "person", "vendor", "partner"]
                if any(kw in col_name_lower for kw in entity_keywords):
                    col_class = "PERSON/ENTITY"
                else:
                    col_class = "Dimension"
                
        schema.append({"name": col, "type": canonical_type, "classification": col_class})
        
        profile_columns[col] = {
            "type": canonical_type,
            "classification": col_class,
            "null_count": null_count,
            "unique_count": unique_count
        }
    
    duplicates = int(df.duplicated().sum())
    memory_usage = int(df.memory_usage(deep=True).sum())
    
    # Calculate simple Data Quality Score (0-100)
    total_cells = total_rows * len(df.columns)
    null_penalty = (total_nulls / total_cells) * 100 if total_cells > 0 else 0
    duplicate_penalty = (duplicates / total_rows) * 100 if total_rows > 0 else 0
    quality_score = max(0, min(100, 100 - (null_penalty * 0.5) - (duplicate_penalty * 0.5)))
    
    profile = {
        "rows": total_rows,
        "columns": len(df.columns),
        "duplicates": duplicates,
        "memory_usage_bytes": memory_usage,
        "quality_score": round(quality_score, 1),
        "column_stats": profile_columns
    }
    
    # Fill NA values with None to prevent JSON serialization errors and SQLite type errors
    df_clean = df.where(pd.notnull(df), None)
    
    # Insert into PostgreSQL using SQLAlchemy
    engine = create_engine(DATABASE_URL)
    schema_name = _get_project_schema_name(project_id)
    try:
        # Save DataFrame to SQL. Overwrites if it exists.
        df_clean.to_sql(table_name, engine, schema=schema_name, if_exists='replace', index=False)
        
        # Get preview data (first 30 rows)
        preview_data = df_clean.head(30).to_dict(orient='records')
        
        # Build semantic index for the new columns
        semantic_index = generate_semantic_index(df.columns.tolist())
        
        return {
            "table_name": table_name,
            "schema": schema,
            "preview": preview_data,
            "total_rows": total_rows,
            "semantic_index": semantic_index,
            "profile": profile
        }
    finally:
        engine.dispose()
