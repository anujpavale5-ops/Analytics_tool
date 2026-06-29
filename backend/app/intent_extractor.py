import os
import json
import logging
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv

from app.local_intent_engine import parse_local_intent, normalize_text
from app.database import learn_alias

load_dotenv()

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

INTENT_CACHE = {}

def extract_intent(question: str, schema: dict, project_id: str = None, semantic_index: dict = None, learned_aliases: dict = None) -> dict:
    """
    Extracts analytics intent using a multi-tiered approach:
    1. Cache Check
    2. Local Deterministic NLP Engine
    3. Gemini Fallback
    4. Failsafe Mode
    """
    if semantic_index is None: semantic_index = {}
    if learned_aliases is None: learned_aliases = {}
    
    # Tier 1: Cache Check
    cache_key = f"{project_id}:{question.strip().lower()}" if project_id else question.strip().lower()
    if cache_key in INTENT_CACHE:
        return INTENT_CACHE[cache_key]
        
    # Tier 2: Local Intent Engine
    local_intent = parse_local_intent(question, schema, semantic_index, learned_aliases)
    
    if local_intent["confidence"] >= 80:
        INTENT_CACHE[cache_key] = local_intent
        return local_intent
        
    # Tier 3: Gemini Fallback
    schema_str = json.dumps(schema, indent=2)
    
    prompt = f"""
    You are an expert Data Analyst Intent Extractor.
    Your sole job is to parse the user's natural language question and map it to the provided schema.
    
    You MUST output valid JSON and ONLY JSON in the following exact format.
    
    Output Format (JSON):
    {{
        "table": "table_name_here",
        "metric": "avg|sum|count|max|min|raw",
        "column": "column_name_to_aggregate",
        "group_by": "column_name_to_group_by",
        "filters": [
            {{"column": "col_name", "operator": "=", "value": "some_value"}}
        ],
        "sort": "asc|desc|null",
        "limit": 10,
        "chart_preference": "bar|line|pie|null",
        "confidence": "HIGH|MEDIUM|LOW"
    }}
    
    Rules:
    1. NEVER generate SQL.
    2. ONLY use table and column names that exist in the Schema below.
    3. If there is no grouping, set "group_by" to null.
    4. If the question just asks for data (no aggregation), set metric to "raw".
    5. If limit is not specified, set it to null.
    6. For filters, operator can be =, >, <, >=, <=, !=.
    
    Schema:
    {schema_str}
    
    User Question: {question}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        result_content = response.text
        gemini_intent = json.loads(result_content)
        gemini_intent["confidence"] = 100 # AI successfully answered
        
        # Query Learning Engine
        # If Gemini found a valid column and we didn't have it in learned_aliases,
        # we try to figure out which word in the question meant that column.
        if project_id and gemini_intent.get("column") and gemini_intent["column"] != "*":
            target_col = gemini_intent["column"]
            words = normalize_text(question).split()
            for word in words:
                # If word is not an exact match, not in semantic index, but gemini chose it, learn it!
                if word not in semantic_index and word not in learned_aliases and len(word) > 3:
                    learn_alias(project_id, word, target_col)
                    # Just learn the first unmatched meaningful word to avoid noise
                    break
        
        INTENT_CACHE[cache_key] = gemini_intent
        return gemini_intent
        
    except Exception as e:
        # Tier 4: Failsafe Mode
        logging.warning(f"Gemini API failed: {e}. Falling back to local intent.")
        
        # If we have a partially confident local intent, use it rather than crashing
        if local_intent["confidence"] >= 30:
            return local_intent
            
        return {
            "error": "I could not fully understand the request. Please rephrase or select a suggested query.",
            "confidence": 0
        }
