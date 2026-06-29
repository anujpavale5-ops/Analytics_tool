import json
from app.schema_reader import process_file
from app.database import get_projects

# Find the project
projects = get_projects("94df1880-3b7f-40fd-a013-46adabb238ca") # Just a guess on workspace, I can just use a specific project ID if known, or just test process_file
project_id = "15c3ce3c-95b2-4b8e-b3ba-44349a44d4dc" # from previous logs

res = process_file(project_id, "../sample_employees.csv", "sample_employees.csv")
print(json.dumps(res["profile"]["column_stats"], indent=2))
