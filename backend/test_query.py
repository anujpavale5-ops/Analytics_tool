import json
import traceback
from app.main import process_query, QueryRequest

req = QueryRequest(
    project_id="15c3ce3c-95b2-4b8e-b3ba-44349a44d4dc",  # just any id
    question="What is the average Revenue by Department?"
)

try:
    print(process_query(req))
except Exception as e:
    traceback.print_exc()
