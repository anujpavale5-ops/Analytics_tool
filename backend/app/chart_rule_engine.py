import decimal

def determine_chart_type(data: list, columns: list, schema: list, intent: dict = None) -> str:
    """
    Analyzes intent and data to deterministically select the BEST chart type, enforcing V7 Visual Rules.
    """
    if not data or len(data) == 0:
        return "table"

    row_count = len(data)
    if row_count > 100:
        return "table" # Too much data for a clean chart
        
    if len(columns) < 2:
        return "kpi" if row_count == 1 else "table"

    intent_type = (intent.get("intent_type") if intent else "Raw").strip()

    # V7 Visual Validation Rules
    if intent_type == "Trend":
        return "line"
        
    if intent_type == "Correlation":
        return "scatter"
        
    if intent_type in ["Distribution", "Contribution"]:
        if row_count <= 10:
            return "pie"
        return "bar" # Fallback if too many categories for pie
        
    if intent_type == "Ranking":
        return "horizontalBar"
        
    if intent_type in ["Group By", "Comparison"]:
        # Check if the X axis is a date, if so prefer line
        first_row = data[0]
        label_col = columns[0]
        label_val = str(first_row[label_col]).lower()
        if '-' in label_val and len(label_val) >= 8:
            # Simple date heuristic
            import re
            if re.match(r'\d{4}-\d{2}-\d{2}', label_val):
                return "line"
        return "bar"
        
    # Default fallback
    return "table"
