from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import uuid

from app.schema_reader import process_file
from app.database import (
    get_meta_connection, get_db_connection, get_history, get_history_item, add_history, update_history_ai_insights,
    create_workspace, get_workspaces, create_project, get_projects, update_project_metadata, get_project_by_id, learn_alias,
    create_user, authenticate_user, get_user, update_user, delete_workspace, delete_project, fetch_data, get_schema, save_report, delete_history_item, delete_dataset,
    create_report, get_reports_by_project, get_report_by_id, get_report_versions, delete_report,
    save_query, get_saved_queries, delete_saved_query
)
import json
from app.intent_extractor import extract_intent
from app.sql_security import validate_read_only_sql
from app.intent_validator import validate_intent
from app.sql_template_engine import build_sql
from app.query_executor import execute_generated_sql
from app.kpi_engine import compute_kpis
from app.chart_rule_engine import determine_chart_type
from app.rule_based_insights import generate_rule_based_insights
from app.ai_insight_engine import generate_deep_insights

app = FastAPI(title="Analytics Copilot API")

# Setup CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

import tempfile
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "analytics_uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def get_schema(project_id: str):
    p = get_project_by_id(project_id)
    if p and p.get("schema"):
        return p["schema"]
    return {}

class AuthRequest(BaseModel):
    username: str
    password: str

class UpdateUserRequest(BaseModel):
    username: str = None
    current_password: str = None
    password: str = None
    avatar_data: str = None
    theme: str = None

class WorkspaceRequest(BaseModel):
    name: str

class ProjectRequest(BaseModel):
    workspace_id: str
    name: str

class QueryRequest(BaseModel):
    project_id: str
    question: str

class ExecuteSqlRequest(BaseModel):
    project_id: str
    sql: str

class InsightRequest(BaseModel):
    question: str
    data_sample: list

# --- Auth ---
@app.post("/register")
def api_register(request: AuthRequest):
    if not request.username.strip() or not request.password.strip():
        raise HTTPException(status_code=400, detail="Username and password are required.")
    
    user = create_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=400, detail="Username already exists.")
    return {"success": True, "user": user}

@app.post("/login")
def api_login(request: AuthRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {"success": True, "user": user}

@app.get("/users/me")
def api_get_me(x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    user = get_user(x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "user": user}

@app.put("/users/me")
def api_update_me(request: UpdateUserRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    
    try:
        success = update_user(
            x_user_id, 
            username=request.username,
            current_password=request.current_password,
            password=request.password,
            avatar_data=request.avatar_data,
            theme=request.theme
        )
        if not success:
            raise HTTPException(status_code=400, detail="Update failed")
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Workspaces ---
@app.post("/workspaces")
def api_create_workspace(request: WorkspaceRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID header required.")
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    ws = create_workspace(x_user_id, request.name)
    return {"success": True, "workspace": ws}

@app.get("/workspaces")
def api_get_workspaces(x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID header required.")
    ws_list = get_workspaces(x_user_id)
    return {"success": True, "workspaces": ws_list}

@app.delete("/workspaces/{workspace_id}")
def api_delete_workspace(workspace_id: str, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    # Basic protection: real app would verify workspace belongs to user
    success = delete_workspace(workspace_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete workspace")
    return {"success": True}

# --- Projects ---
@app.post("/projects")
def api_create_project(request: ProjectRequest):
    if not request.name.strip() or not request.workspace_id.strip():
        raise HTTPException(status_code=400, detail="Invalid project data.")
    p = create_project(request.workspace_id, request.name)
    return {"success": True, "project": p}

@app.get("/workspaces/{workspace_id}/projects")
def api_get_projects(workspace_id: str):
    p_list = get_projects(workspace_id)
    return {"success": True, "projects": p_list}

@app.delete("/projects/{project_id}")
def api_delete_project(project_id: str):
    success = delete_project(project_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete project")
    return {"success": True}

# --- History ---


@app.get("/history/{history_id}")
def api_get_history_item(history_id: str):
    item = get_history_item(history_id)
    if not item:
        raise HTTPException(status_code=404, detail="History item not found")
        
    try:
        if item.get("data"): item["data"] = json.loads(item["data"])
        if item.get("columns"): item["columns"] = json.loads(item["columns"])
        if item.get("intent"): item["intent"] = json.loads(item["intent"])
        if item.get("kpis"): item["kpis"] = json.loads(item["kpis"])
    except Exception:
        pass
    
    return item

# --- File Upload & Tables ---
@app.delete("/projects/{project_id}/datasets/{table_name}")
def api_delete_dataset(project_id: str, table_name: str):
    success = delete_dataset(project_id, table_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete dataset")
    return {"success": True}

@app.post("/upload")
def upload_file(project_id: str = Form(...), file: UploadFile = File(...)):
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported.")
    if not project_id:
        raise HTTPException(status_code=400, detail="Project ID is required.")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        result = process_file(project_id, file_path, file.filename)
        
        # Save to projects table
        new_schema = {result["table_name"]: result["schema"]}
        new_semantic_index = result["semantic_index"]
        new_profile = {result["table_name"]: result["profile"]}
        update_project_metadata(project_id, new_schema, new_semantic_index, new_profile)
        
        return {"success": True, "message": "File processed successfully", "data": result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.get("/tables")
def list_tables(project_id: str):
    if not project_id:
        raise HTTPException(status_code=400, detail="Project ID is required.")
    try:
        schema = get_schema(project_id)
        return {"success": True, "schema": schema}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/tables/{table_name}/data")
def preview_table(project_id: str, table_name: str):
    try:
        # Prevent SQL injection loosely by ensuring table_name is in schema
        schema = get_schema(project_id)
        if table_name not in schema:
            raise HTTPException(status_code=404, detail="Table not found.")
            
        data = fetch_data(project_id, f"SELECT * FROM {table_name} LIMIT 30")
        columns = [col["name"] for col in schema[table_name]]
        
        return {
            "success": True,
            "data": data,
            "columns": columns
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/suggested_questions")
def get_suggested_questions(project_id: str):
    project = get_project_by_id(project_id)
    if not project or not project.get("schema"):
        return {"success": False, "questions": []}
        
    schema = project["schema"]
    profile = project.get("profile", {})
    
    def format_col_name(col_name):
        return col_name.replace("_", " ").title()
        
    scored_questions = []
    
    for table_name, columns in schema.items():
        table_profile = profile.get(table_name, {})
        column_stats = table_profile.get("column_stats", {})
        total_rows = table_profile.get("rows", 0)
        
        identifiers = []
        categories = []
        dimensions = []
        measures = []
        dates = []
        
        for c in columns:
            col_name = c["name"]
            c_type = c.get("type", "text")
            
            stats = column_stats.get(col_name, {})
            unique_count = stats.get("unique_count", -1)
            
            is_identifier = False
            col_name_lower = col_name.lower()
            if "id" in col_name_lower.split("_") or "uuid" in col_name_lower or "key" in col_name_lower or "code" in col_name_lower:
                is_identifier = True
            if unique_count > 0 and total_rows > 0 and unique_count >= total_rows * 0.95:
                is_identifier = True
                
            if is_identifier:
                identifiers.append(col_name)
                continue
                
            if c_type == "date" or c.get("classification") == "Date":
                dates.append(col_name)
                continue
                
            if c_type == "number":
                if unique_count != -1 and unique_count < 20 and unique_count < total_rows * 0.8:
                    categories.append(col_name)
                else:
                    measures.append(col_name)
            else:
                if unique_count != -1 and unique_count < 20 and unique_count < total_rows * 0.8:
                    categories.append(col_name)
                else:
                    dimensions.append(col_name)
                    
        if not categories and dimensions:
            categories.append(dimensions[0])
            
        # 1. Measure + Category (Base 90)
        for m in measures[:3]:
            for cat in categories[:3]:
                cat_stats = column_stats.get(cat, {})
                bonus = 5 if 0 < cat_stats.get("unique_count", 0) < 10 else 0
                scored_questions.append({"q": f"What is the average {format_col_name(m)} by {format_col_name(cat)}?", "score": 90 + bonus})
                scored_questions.append({"q": f"What is the total {format_col_name(m)} by {format_col_name(cat)}?", "score": 88 + bonus})
                
        # 2. Measure + Date (Base 95)
        for m in measures[:3]:
            for d in dates[:1]:
                scored_questions.append({"q": f"How has {format_col_name(m)} changed over time?", "score": 95})
                
        # 3. Count(Identifier) + Category (Base 85)
        for idx in identifiers[:2]:
            for cat in categories[:3]:
                scored_questions.append({"q": f"How many {format_col_name(idx)} records are there per {format_col_name(cat)}?", "score": 85})
                
        # 4. Trend Analysis (Base 85)
        for m in measures[:3]:
            if dates:
                scored_questions.append({"q": f"What is the monthly trend of {format_col_name(m)}?", "score": 85})
                
        # 5. Distribution Analysis (Base 80)
        for m in measures[:3]:
            scored_questions.append({"q": f"What is the distribution of {format_col_name(m)}?", "score": 80})
            
        if not scored_questions and categories:
            for cat in categories[:3]:
                scored_questions.append({"q": f"Count of records by {format_col_name(cat)}", "score": 80})
            
        break # Just do the first table for now
        
    valid_questions = [sq for sq in scored_questions if sq["score"] >= 80]
    valid_questions.sort(key=lambda x: x["score"], reverse=True)
    
    seen = set()
    final_questions = []
    for sq in valid_questions:
        if sq["q"] not in seen:
            seen.add(sq["q"])
            final_questions.append(sq["q"])
            if len(final_questions) >= 5:
                break
                
    return {"success": True, "questions": final_questions}



@app.get("/projects/{project_id}/history")
def api_get_history(project_id: str):
    try:
        from app.database import get_history
        history = get_history(project_id)
        return {"success": True, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Queries ---
@app.post("/query")
def process_query(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not request.project_id.strip():
        raise HTTPException(status_code=400, detail="Project ID cannot be empty.")
        
    try:
        from app.v7_intent_engine import extract_v7_intent
        from app.v7_self_correction_engine import generate_and_validate_sql_loop
        from app.v7_validation_engine import validate_results
        
        # 1. Get current project metadata
        project = get_project_by_id(request.project_id)
        if not project or not project.get("schema"):
            return {"success": False, "error": "No data available. Please upload a file first."}
            
        schema = project["schema"]
            
        # 2. Extract Intent via V7 strict engine
        intent = extract_v7_intent(request.question, schema)
        confidence = intent.get("confidence", 0)
        
        # 3. Validation Loop & Self-Correction Engine (SQL Generation + SQL Validation)
        loop_res = generate_and_validate_sql_loop(intent, schema)
        if not loop_res["success"]:
            return {"success": False, "error": loop_res["error"], "sql": loop_res.get("sql", ""), "confidence": confidence}
            
        sql = loop_res["sql"]
        
        # 4. Execute Query
        exec_result = execute_generated_sql(request.project_id, sql)
        if not exec_result["success"]:
            # Optionally trigger correction loop here for runtime errors, but we return for now
            return {"success": False, "error": "Runtime Error: " + exec_result["error"], "sql": sql, "confidence": confidence}
            
        data = exec_result["data"]
        columns = exec_result["columns"]
        
        # 5. Result Validation Engine
        res_validation = validate_results(intent, data)
        if not res_validation["valid"]:
            # If shape is completely wrong, we penalize confidence heavily or reject
            confidence = max(0, confidence - 40)
            return {"success": False, "error": res_validation["reason"], "sql": sql, "confidence": confidence}
            
        # 6. Analytics Engines (KPI, Insights, Chart validation)
        from app.presentation_planner import VisualizationPlanner, LocalInsightsEngine
        from app.query_planner import QueryPlanner
        
        plan = QueryPlanner.build_plan(intent, schema)
        kpis = compute_kpis(data)
        chart_type = VisualizationPlanner.plan_visualization(plan, data)
        insights = LocalInsightsEngine.generate_insights(plan, data)
        
        # 7. Final Confidence Safety Rule & Debug Logging
        import logging
        logging.info(f"V7 DEBUG LOG - Question: {request.question}")
        logging.info(f"V7 DEBUG LOG - Intent: {intent.get('intent_type')}")
        logging.info(f"V7 DEBUG LOG - Entity: {intent.get('group_by')}")
        logging.info(f"V7 DEBUG LOG - Metric: {intent.get('metrics')}")
        logging.info(f"V7 DEBUG LOG - Filters: {intent.get('filters')}")
        logging.info(f"V7 DEBUG LOG - SQL: {sql}")
        logging.info(f"V7 DEBUG LOG - Confidence: {confidence}")
            
        # 8. Save to History
        intent_str = json.dumps(intent, default=str)
        data_str = json.dumps(data, default=str)
        cols_str = json.dumps(columns, default=str)
        kpis_str = json.dumps(kpis, default=str)
        insights_str = json.dumps(insights, default=str)
        h_res = add_history(request.project_id, request.question, intent_str, sql, data_str, cols_str, kpis_str, chart_type, insights_str)
            
        return {
            "success": True,
            "history_id": h_res["id"],
            "intent": intent,
            "sql": sql,
            "data": data,
            "columns": columns,
            "kpis": kpis,
            "chart_type": chart_type,
            "insights": insights,
            "confidence": confidence,
            "execution_time_ms": exec_result.get("execution_time_ms", 0),
            "row_count": exec_result.get("row_count", 0)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class DeepInsightRequest(BaseModel):
    history_id: str
    question: str
    data: list

@app.post("/deep_insights")
def process_deep_insights(request: DeepInsightRequest):
    try:
        ai_insights = generate_deep_insights(request.question, request.data)
        
        if request.history_id:
            update_history_ai_insights(request.history_id, ai_insights)
            
        return {"success": True, "ai_insights": ai_insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveReportRequest(BaseModel):
    report_name: str

@app.post("/reports/save")
def api_save_report(history_id: str, request: SaveReportRequest):
    try:
        hist = get_history_item(history_id)
        if not hist:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        group_id = str(uuid.uuid4())
        r_id = create_report(
            group_id=group_id,
            project_id=hist["project_id"],
            version=1,
            report_name=request.report_name,
            question=hist["question"],
            resolved_question=hist.get("intent") or "{}",
            generated_sql=hist.get("sql") or "",
            result_data=hist.get("data") or "[]",
            chart_type=hist.get("chart_type") or "table",
            chart_config=hist.get("columns") or "[]",
            kpis=hist.get("kpis") or "{}",
            insights=hist.get("insights") or "[]",
            ai_insights=hist.get("ai_insights") or ""
        )
        return {"success": True, "report_id": r_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/reports")
def api_get_reports(project_id: str):
    try:
        reports = get_reports_by_project(project_id)
        return {"success": True, "reports": reports}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/reports/{report_id}")
def api_get_report(report_id: str):
    try:
        rep = get_report_by_id(report_id)
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")
            
        # Parse JSON fields for frontend
        try:
            if rep.get("resolved_question"): rep["resolved_question"] = json.loads(rep["resolved_question"])
            if rep.get("result_data"): rep["result_data"] = json.loads(rep["result_data"])
            if rep.get("chart_config"): rep["chart_config"] = json.loads(rep["chart_config"])
            if rep.get("kpis"): rep["kpis"] = json.loads(rep["kpis"])
            if rep.get("insights"): rep["insights"] = json.loads(rep["insights"])
        except Exception:
            pass
            
        return rep
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/reports/{report_id}")
def api_delete_report(report_id: str):
    try:
        delete_report(report_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reports/{report_id}/duplicate")
def api_duplicate_report(report_id: str):
    try:
        rep = get_report_by_id(report_id)
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")
        
        group_id = str(uuid.uuid4())
        r_id = create_report(
            group_id=group_id,
            project_id=rep["project_id"],
            version=1,
            report_name=rep["report_name"] + " (Copy)",
            question=rep["question"],
            resolved_question=rep.get("resolved_question", "{}"),
            generated_sql=rep.get("generated_sql", ""),
            result_data=rep.get("result_data", "[]"),
            chart_type=rep.get("chart_type", "table"),
            chart_config=rep.get("chart_config", "[]"),
            kpis=rep.get("kpis", "{}"),
            insights=rep.get("insights", "[]"),
            ai_insights=rep.get("ai_insights", "")
        )
        return {"success": True, "report_id": r_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReanalyzeRequest(BaseModel):
    pass # Currently empty, but useful if they wanted to pass a new question

@app.post("/reports/{report_id}/reanalyze")
def api_reanalyze_report(report_id: str):
    try:
        rep = get_report_by_id(report_id)
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")
            
        project_id = rep["project_id"]
        question = rep["question"]
        group_id = rep["group_id"]
        
        # 1. Re-run analytics
        schema_dict = get_schema(project_id)
        intent = extract_intent(question, list(schema_dict.keys()))
        val_res = validate_intent(intent, schema_dict)
        if not val_res["valid"]:
            raise HTTPException(status_code=400, detail=val_res["reason"])
            
        sql = build_sql(intent, schema_dict)
        if not sql:
            raise HTTPException(status_code=400, detail="Could not generate valid SQL.")
            
        rows, cols = execute_generated_sql(project_id, sql)
        
        from app.kpi_engine import generate_kpis
        from app.chart_engine import decide_chart_type
        from app.insight_engine import generate_insights
        
        kpis = generate_kpis(rows, cols, intent)
        chart_type = decide_chart_type(rows, cols, intent)
        insights = generate_insights(rows, cols, intent)
        
        # Determine new version
        versions = get_report_versions(group_id)
        next_version = versions[0]["version"] + 1 if versions else 1
        
        r_id = create_report(
            group_id=group_id,
            project_id=project_id,
            version=next_version,
            report_name=rep["report_name"],
            question=question,
            resolved_question=json.dumps(intent),
            generated_sql=sql,
            result_data=json.dumps(rows, default=str),
            chart_type=chart_type,
            chart_config=json.dumps(cols),
            kpis=json.dumps(kpis),
            insights=json.dumps(insights),
            ai_insights=""
        )
        return {"success": True, "report_id": r_id, "version": next_version}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute_sql")
def execute_sql_endpoint(request: ExecuteSqlRequest):
    if not request.sql.strip() or not request.project_id.strip():
        raise HTTPException(status_code=400, detail="Invalid request data.")
        
    try:
        # V10.1 SQL Security Check
        sec_check = validate_read_only_sql(request.sql)
        if not sec_check["valid"]:
            return {"success": False, "error": sec_check["reason"]}
            
        exec_result = execute_generated_sql(request.project_id, request.sql)
        if not exec_result["success"]:
            return {"success": False, "error": exec_result["error"]}
            
        data = exec_result["data"]
        columns = exec_result["columns"]
        
        # Determine chart type dynamically
        project = get_project_by_id(request.project_id)
        schema = project.get("schema", []) if project else []
        chart_type = determine_chart_type(data, columns, schema)
            
        return {
            "success": True,
            "data": data,
            "columns": columns,
            "execution_time_ms": exec_result.get("execution_time_ms", 0),
            "row_count": exec_result.get("row_count", 0),
            "chart_type": chart_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveSqlRequest(BaseModel):
    name: str
    sql: str
    chart_type: str = "table"

@app.post("/projects/{project_id}/sql/save")
def api_save_sql(project_id: str, request: SaveSqlRequest):
    try:
        q_id = save_query(project_id, request.name, request.sql, request.chart_type)
        return {"success": True, "query_id": q_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/sql/saved")
def api_get_saved_sql(project_id: str):
    try:
        queries = get_saved_queries(project_id)
        return {"success": True, "queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sql/saved/{query_id}")
def api_delete_saved_sql(query_id: str):
    try:
        delete_saved_query(query_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/history/{history_id}")
def api_delete_history(history_id: str):
    try:
        delete_history_item(history_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExplainSqlRequest(BaseModel):
    sql: str

@app.post("/projects/{project_id}/sql/explain")
def api_explain_sql(project_id: str, request: ExplainSqlRequest):
    try:
        from app.v7_intent_engine import get_gemini_client
        client = get_gemini_client()
        prompt = f"Explain the following SQL query in one short human-readable sentence. Do not include quotes or extra text.\n\nSQL: {request.sql}"
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"success": True, "explanation": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveReportFromSqlRequest(BaseModel):
    project_id: str
    report_name: str
    sql: str
    chart_type: str
    data: list
    columns: list

@app.post("/reports/from_sql")
def api_save_report_from_sql(request: SaveReportFromSqlRequest):
    try:
        import uuid
        from app.kpi_engine import compute_kpis
        from app.rule_based_insights import generate_rule_based_insights
        
        group_id = str(uuid.uuid4())
        
        # Calculate KPIs and Insights dynamically from the data
        kpis = compute_kpis(request.data)
        insights = generate_rule_based_insights(request.data, {})
        
        r_id = create_report(
            group_id=group_id,
            project_id=request.project_id,
            version=1,
            report_name=request.report_name,
            question="Custom SQL Query",
            resolved_question="{}",
            generated_sql=request.sql,
            result_data=json.dumps(request.data, default=str),
            chart_type=request.chart_type,
            chart_config=json.dumps(request.columns),
            kpis=json.dumps(kpis),
            insights=json.dumps(insights),
            ai_insights=""
        )
        return {"success": True, "report_id": r_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
