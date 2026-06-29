import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def generate_deep_insights(question: str, data: list) -> str:
    """
    Calls Gemini API to generate advanced business analysis.
    Takes a max sample of 50 aggregated records to save tokens.
    """
    if not data:
        return "No data available for analysis."
        
    data_sample = data[:50]
    data_str = json.dumps(data_sample, indent=2)
    
    prompt = f"""
    You are an expert Business Intelligence Analyst.
    Please provide an advanced business analysis based on the following aggregated data results.
    
    User Question: {question}
    
    Aggregated Results:
    {data_str}
    
    Please structure your response with the following sections using markdown:
    ### Key Findings
    (bullet points)
    
    ### Risks
    (bullet points)
    
    ### Opportunities
    (bullet points)
    
    ### Recommendations
    (bullet points)
    
    Keep the analysis concise, insightful, and strictly based on the provided data. Do not hallucinate.
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"Could not generate AI insights due to an error: {str(e)}"
