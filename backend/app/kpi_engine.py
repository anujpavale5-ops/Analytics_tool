import decimal

def compute_kpis(data: list) -> dict:
    """
    Computes common KPIs (Total Records, Highest Value, Lowest Value, Average Value).
    For single value queries, just shows Result Value.
    """
    if not data:
        return {}

    row_count = len(data)
    first_row = data[0]
    keys = list(first_row.keys())
    
    # Identify if it's a pure single value (1 row, 1 column)
    if row_count == 1 and len(keys) == 1:
        val = first_row[keys[0]]
        if isinstance(val, (int, float, decimal.Decimal)):
            val = round(float(val), 2)
        return {"Result Value": val}
        
    numeric_cols = [k for k in keys if isinstance(first_row[k], (int, float, decimal.Decimal))]
    
    kpis = {
        "Total Records": row_count
    }
    
    if not numeric_cols:
        return kpis
        
    # Compute for the primary numeric column
    primary_num_col = numeric_cols[-1] 
    
    values = [float(row[primary_num_col]) for row in data if isinstance(row[primary_num_col], (int, float, decimal.Decimal))]
    
    if values:
        kpis["Highest Value"] = round(max(values), 2)
        kpis["Lowest Value"] = round(min(values), 2)
        kpis["Average Value"] = round(sum(values) / len(values), 2)
        
    return kpis
