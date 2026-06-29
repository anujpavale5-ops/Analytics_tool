import statistics
import decimal

def generate_rule_based_insights(data: list, intent: dict) -> str:
    """
    Generates text insights deterministically using Python code, no AI.
    Analyzes for Trends, Outliers, Percentage Contribution, and Top N.
    """
    if not data:
        return "No data available to generate insights."

    insights = []
    
    if len(data) == 1:
        # Single row result
        row = data[0]
        insights.append(f"The query returned a single result: {list(row.values())[0]}")
        return insights

    # Multiple rows
    first_row = data[0]
    numeric_cols = [k for k, v in first_row.items() if isinstance(v, (int, float, decimal.Decimal))]
    label_col = [k for k, v in first_row.items() if isinstance(v, str)]
    
    if not numeric_cols or not label_col:
        insights.append("The data is evenly distributed with no extreme outliers detected.")
        return insights

    val_col = numeric_cols[-1]
    name_col = label_col[0]
    
    # Filter out rows with None values and cast Decimal to float for calculations
    valid_data = []
    for row in data:
        if isinstance(row[val_col], (int, float, decimal.Decimal)):
            row[val_col] = float(row[val_col])
            valid_data.append(row)
    if not valid_data:
        return ["No valid numeric data for insights."]

    # Sorting for Min/Max
    sorted_data = sorted(valid_data, key=lambda x: x[val_col], reverse=True)
    max_row = sorted_data[0]
    min_row = sorted_data[-1]
    total_sum = sum(row[val_col] for row in valid_data)
    
    # Rule 1 & 3: Highest Value / Top Performer
    insights.append(f"**Highest Value:** {max_row[name_col]} has the highest {val_col} at {max_row[val_col]:,.2f}.")
    
    # Rule 2: Lowest Value
    if min_row != max_row:
        insights.append(f"**Lowest Value:** {min_row[name_col]} has the lowest {val_col} at {min_row[val_col]:,.2f}.")

    # Rule 6: Percentage Contribution
    if total_sum > 0:
        pct = (max_row[val_col] / total_sum) * 100
        insights.append(f"**Top Contribution:** {max_row[name_col]} contributes {pct:.1f}% of the total {val_col}.")

    # Rule 8: Top N Summary (Top 3)
    if len(sorted_data) >= 4 and total_sum > 0:
        top_3_sum = sum(row[val_col] for row in sorted_data[:3])
        top_3_pct = (top_3_sum / total_sum) * 100
        insights.append(f"**Top 3 Summary:** The top 3 items contribute {top_3_pct:.1f}% of total {val_col}.")

    # Rule 7: Outlier Detection
    if len(valid_data) >= 4:
        values = [row[val_col] for row in valid_data]
        mean_val = statistics.mean(values)
        stdev_val = statistics.stdev(values) if len(values) > 1 else 0
        if stdev_val > 0:
            if max_row[val_col] > mean_val + (2 * stdev_val):
                insights.append(f"**Outlier Detected:** {max_row[name_col]}'s {val_col} is significantly higher than average.")

    # Rule 4 & 5: Trend Detection
    # If the label column looks chronological, we can check sequential trend
    # Or just general sequential trend in the data list
    if len(valid_data) >= 3:
        # Check if consistently increasing
        is_increasing = all(valid_data[i][val_col] <= valid_data[i+1][val_col] for i in range(len(valid_data)-1))
        # Check if consistently decreasing
        is_decreasing = all(valid_data[i][val_col] >= valid_data[i+1][val_col] for i in range(len(valid_data)-1))
        
        if is_increasing:
            insights.append(f"**Trend Detected:** {val_col} shows a consistently increasing trend.")
        elif is_decreasing:
            insights.append(f"**Drop Detected:** {val_col} shows a consistently decreasing trend.")
        else:
            # Simple change
            first_val = valid_data[0][val_col]
            last_val = valid_data[-1][val_col]
            if first_val != 0:
                diff = last_val - first_val
                pct = (diff / first_val) * 100
                direction = "increased" if diff > 0 else "decreased"
                if abs(pct) > 5:
                    insights.append(f"**Overall Change:** {val_col} {direction} by {abs(pct):.1f}% from the first to the last record.")

    return insights
