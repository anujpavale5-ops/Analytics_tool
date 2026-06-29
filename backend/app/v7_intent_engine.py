import os
import json
import logging
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

SUPPORTED_INTENTS = [
    "Aggregation", "Group By", "Ranking", "Trend", "Distribution",
    "Comparison", "Filtering", "Contribution", "Correlation", "Raw"
]

def extract_v7_intent(question: str, schema: dict) -> dict:
    """
    Extracts strictly validated V7 intent.
    schema format expected: dict of table_name -> { "columns": [ { "name": ..., "type": ..., "classification": "Measure|Identifier|Date|Category|Dimension" } ] }
    """
    schema_str = json.dumps(schema, indent=2)
    
    prompt = f"""
    You are a strictly deterministic V7 Analytics Intent Classification Engine.
    Your job is to parse the user's question, analyze the schema, and output a valid JSON intent object.
    
    SUPPORTED INTENTS:
    - Aggregation (e.g., average salary, max price)
    - Group By (e.g., salary by department)
    - Ranking (e.g., top 5 customers, lowest sales)
    - Trend (e.g., monthly revenue, growth over time)
    - Distribution (e.g., breakdown of employees, share of sales)
    - Comparison (e.g., compare sales vs marketing, A vs B)
    - Filtering (e.g., employees in Pune)
    - Contribution (e.g., percentage of total sales)
    - Correlation (e.g., relationship between height and weight)
    - Raw (e.g., show me the data, list all employees)
    
    COLUMN ROLE RULES:
    - "Identifier" columns (e.g., id, employee_id) MUST NEVER be used for AVG, SUM, MIN, MAX. They can only be used for COUNT or DISTINCT COUNT.
    - "Date" columns MUST be present for 'Trend' intent.
    - "Measure" columns should be used for aggregations.
    
    SEMANTIC COLUMN MAPPING RULES:
    - Do NOT rely on exact column names from the question. Infer meaning from the schema.
    - If the user asks for 'customer', map to 'client_name', 'buyer_name', or 'account_name' if available. Look for PERSON/ENTITY.
    - If the user asks for 'salary', map to 'income', 'pay', or 'compensation' if available. Look for MEASURE.
    - If the user asks for 'revenue', map to 'sales', 'total_amount', 'net_sales' if available. Look for MEASURE.
    - The system MUST adapt to the schema. Do not fail because exact names do not exist.
    
    ENTITY PRESERVATION RULE:
    - When a query references entities like customer, employee, product, department, city, region, state, or manager, you MUST ALWAYS include that entity column in the "group_by". Never return a metric only if an entity is requested.
    
    DEFAULT AGGREGATION RULES FOR MEASURES:
    - Revenue columns (revenue, sales, amount, total_amount, profit, quantity) -> Default to SUM
    - Salary columns (salary) -> Default to AVG
    - Performance columns (performance_score) -> Default to AVG
    - Identifier columns (id) -> Default to COUNT
    
    RANKING QUERY RULE:
    - Ranking queries MUST aggregate their measure (e.g. SUM(revenue) or AVG(salary)) and group by their entity.
    - NEVER leave a measure unaggregated in a Ranking query.
    
    Output Format (JSON):
    {{
        "intent_type": "One of the SUPPORTED INTENTS strictly",
        "table": "table_name",
        "metrics": [
            {{"column": "col_name", "aggregation": "AVG|SUM|COUNT|MAX|MIN|RAW"}}
        ],
        "group_by": ["col1", "col2"],
        "filters": [
            {{"column": "col_name", "operator": "=", "value": "some_value"}}
        ],
        "sort": {{"column": "col_name", "direction": "ASC|DESC"}},
        "limit": 10,
        "confidence": 95
    }}
    
    Rules:
    1. NEVER generate SQL.
    2. ONLY use table and column names that exist in the Schema below.
    3. If there is no grouping, set "group_by" to [].
    4. If limit is not specified, set it to null.
    5. Confidence should be an integer between 0 and 100. Be realistic based on how well the question maps to the schema.
    6. For Ranking, you MUST include a sort object and a limit.
    7. For Trend, you MUST include a Date column in group_by and sort.
    
    Schema:
    {schema_str}
    
    User Question: {question}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        result = json.loads(response.text)
        
        # Enforce defaults if Gemini misses them
        if "metrics" not in result: result["metrics"] = []
        if "group_by" not in result or not result["group_by"]: result["group_by"] = []
        if "filters" not in result: result["filters"] = []
        if "sort" not in result: result["sort"] = None
        if "limit" not in result: result["limit"] = None
        result["original_question"] = question
        
        # Override confidence if invalid intent type
        if result.get("intent_type") not in SUPPORTED_INTENTS:
            result["intent_type"] = "Raw"
            result["confidence"] = min(result.get("confidence", 50), 50)
            
        # DETERMINISTIC QUERY OVERRIDE ENGINE
        # If the query successfully maps an entity (group_by) and metric (metrics) for ANY valid intent, boost confidence
        # Do not ask for clarification for simple and obvious queries
        intent = result.get("intent_type")
        has_metric = len(result["metrics"]) > 0 and result["metrics"][0].get("column")
        has_entity = len(result["group_by"]) > 0
        
        # Trend requires Date entity (which is still a group_by column)
        # Raw might not have metric/entity, so we don't boost it.
        if intent != "Raw":
            if has_metric and has_entity:
                # Deterministic override
                result["confidence"] = max(result.get("confidence", 0), 95)
            # Special case for raw aggregation (e.g. Total Revenue) where there's no entity
            elif intent == "Aggregation" and has_metric and not has_entity:
                result["confidence"] = max(result.get("confidence", 0), 95)
            
        return result
    except Exception as e:
        logging.error(f"V7 Intent extraction failed: {e}")
        return {
            "intent_type": "Raw",
            "table": list(schema.keys())[0] if schema else "",
            "metrics": [],
            "group_by": [],
            "filters": [],
            "sort": None,
            "limit": 100,
            "confidence": 0,
            "error": str(e)
        }
