import json

class VisualizationPlanner:
    """
    Deterministically determines the best chart type for a query plan.
    """
    @staticmethod
    def plan_visualization(query_plan: dict, data: list = None) -> str:
        metrics = query_plan.get("metrics", [])
        dimensions = query_plan.get("dimensions", [])
        
        num_metrics = len(metrics)
        num_dimensions = len(dimensions)
        
        # Heuristics for chart selection
        if num_dimensions == 0:
            return "kpi" if num_metrics == 1 else "table"
            
        if num_dimensions == 1 and num_metrics == 1:
            dim_col = dimensions[0]["column"].lower()
            # Time + Metric -> Line Chart
            if any(x in dim_col for x in ["date", "time", "month", "year", "day"]):
                return "line"
                
            # Contribution -> Pie/Donut (if data is small)
            if data and len(data) <= 8:
                return "doughnut"
                
            # Category + Metric -> Bar Chart
            return "bar"
            
        if num_dimensions == 0 and num_metrics == 2:
            return "scatter"
            
        if num_dimensions >= 2 and num_metrics >= 1:
            # Multiple Categories -> Grouped Bar (handled via generic bar in Chart.js or table)
            return "bar"
            
        return "table"

class LocalInsightsEngine:
    """
    Generates deterministic insights based on the query plan and execution results, without AI.
    """
    @staticmethod
    def generate_insights(query_plan: dict, data: list) -> list:
        insights = []
        if not data or not query_plan.get("metrics"):
            return insights
            
        metrics = query_plan["metrics"]
        dimensions = query_plan.get("dimensions", [])
        
        for m in metrics:
            alias = m["alias"]
            if alias not in data[0]:
                continue
                
            try:
                values = [float(row[alias]) for row in data if row[alias] is not None]
                if not values:
                    continue
                    
                total = sum(values)
                avg = total / len(values)
                max_val = max(values)
                min_val = min(values)
                
                if not dimensions:
                    insights.append(f"Total {alias} is {total:,.2f}.")
                    insights.append(f"Average {alias} is {avg:,.2f}.")
                    continue
                    
                # Dimension-based insights
                dim_alias = dimensions[0]["alias"]
                
                # Find highest/lowest performer
                sorted_data = sorted(data, key=lambda x: float(x[alias]) if x[alias] is not None else 0, reverse=True)
                highest = sorted_data[0]
                lowest = sorted_data[-1]
                
                insights.append(f"Highest performer for {alias} is {highest.get(dim_alias, 'Unknown')} ({float(highest[alias]):,.2f}).")
                insights.append(f"Lowest performer for {alias} is {lowest.get(dim_alias, 'Unknown')} ({float(lowest[alias]):,.2f}).")
                insights.append(f"Average {alias} across {dim_alias} is {avg:,.2f}.")
                
                # Contribution %
                if total > 0 and len(sorted_data) > 0:
                    top_contrib = (float(highest[alias]) / total) * 100
                    insights.append(f"{highest.get(dim_alias, 'Unknown')} contributes {top_contrib:.1f}% of total {alias}.")
                    
            except (ValueError, TypeError):
                pass
                
        return insights
