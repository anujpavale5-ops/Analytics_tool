import os
import uuid
import hashlib
import json
import re
import re
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import IntegrityError
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL =os.getenv("DATABASE_URL")

# Ensure database exists before connecting to it
def _ensure_db_exists():
    try:
        # Connect to default 'postgres' database to check/create our db
        base_url = "/".join(DATABASE_URL.split("/")[:-1]) + "/postgres"
        db_name = DATABASE_URL.split("/")[-1]
        
        conn = psycopg2.connect(base_url)
        conn.autocommit = True
        cursor = conn.cursor()
        
        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (db_name,))
        exists = cursor.fetchone()
        
        if not exists:
            cursor.execute(f"CREATE DATABASE {db_name}")
            
        conn.close()
    except Exception as e:
        print(f"Database initialization check failed: {e}")

_ensure_db_exists()

def get_meta_connection():
    """Establish and return connection to the PostgreSQL database."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.cursor_factory = RealDictCursor
    return conn

def _init_db_schema_once():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        _init_meta_schema(conn)
        conn.close()
    except Exception as e:
        print("Schema init failed:", e)

def _init_meta_schema(conn):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar_data TEXT,
            theme TEXT DEFAULT 'light',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            schema TEXT,
            semantic_index TEXT,
            learned_aliases TEXT,
            profile TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            question TEXT NOT NULL,
            intent TEXT,
            sql TEXT,
            data TEXT,
            columns TEXT,
            kpis TEXT,
            chart_type TEXT,
            insights TEXT,
            ai_insights TEXT,
            is_saved BOOLEAN DEFAULT FALSE,
            report_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dashboards (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_widgets (
            id TEXT PRIMARY KEY,
            dashboard_id TEXT NOT NULL,
            history_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dashboard_id) REFERENCES dashboards (id),
            FOREIGN KEY (history_id) REFERENCES history (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            version INT NOT NULL DEFAULT 1,
            report_name TEXT,
            question TEXT NOT NULL,
            resolved_question TEXT,
            generated_sql TEXT,
            result_data TEXT,
            chart_type TEXT,
            chart_config TEXT,
            kpis TEXT,
            insights TEXT,
            ai_insights TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS saved_queries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sql TEXT NOT NULL,
            chart_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    """)
    conn.commit()
def _get_project_schema_name(project_id: str) -> str:
    safe_id = project_id.replace('-', '_')
    safe_id = "".join(c for c in safe_id if c.isalnum() or c == '_')
    return f"project_{safe_id}"

def get_db_connection(project_id: str):
    """Return connection to main DB, but the caller must set search_path."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.cursor_factory = RealDictCursor
    schema_name = _get_project_schema_name(project_id)
    # Ensure schema exists (e.g. if we are writing a file)
    with conn.cursor() as cursor:
        cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name}")
    conn.commit()
    return conn

def execute_query(project_id: str, query: str, params: tuple = ()):
    conn = get_db_connection(project_id)
    try:
        cursor = conn.cursor()
        schema_name = _get_project_schema_name(project_id)
        cursor.execute(f"SET search_path TO {schema_name}")
        cursor.execute(query, params)
        conn.commit()
    finally:
        conn.close()

def fetch_data(project_id: str, query: str, params: tuple = ()):
    conn = get_db_connection(project_id)
    try:
        cursor = conn.cursor()
        schema_name = _get_project_schema_name(project_id)
        cursor.execute(f"SET search_path TO {schema_name}")
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def get_schema(project_id: str):
    conn = get_db_connection(project_id)
    try:
        cursor = conn.cursor()
        schema_name = _get_project_schema_name(project_id)
        cursor.execute(f"SET search_path TO {schema_name}")
        
        # PostgreSQL specific query to get tables and columns in schema
        cursor.execute("""
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = %s
            ORDER BY table_name, ordinal_position;
        """, (schema_name,))
        
        columns = cursor.fetchall()
        schema = {}
        for col in columns:
            t_name = col['table_name']
            c_name = col['column_name']
            c_type = col['data_type']
            if t_name not in schema:
                schema[t_name] = []
            schema[t_name].append({"name": c_name, "type": c_type})
            
        return schema
    finally:
        conn.close()

# Meta DB helpers - Auth
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_user(username: str, password: str):
    conn = get_meta_connection()
    try:
        u_id = str(uuid.uuid4())
        hashed = hash_password(password)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (id, username, password_hash) VALUES (%s, %s, %s)", (u_id, username, hashed))
        conn.commit()
        return {"id": u_id, "username": username}
    except IntegrityError:
        conn.rollback()
        return None # Username exists
    finally:
        conn.close()

def authenticate_user(username: str, password: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, password_hash, theme, avatar_data FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
        if user and user['password_hash'] == hash_password(password):
            user_dict = dict(user)
            return {"id": user_dict['id'], "username": username, "theme": user_dict.get('theme', 'light'), "avatar_data": user_dict.get('avatar_data')}
        return None
    finally:
        conn.close()

def get_user(user_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, theme, avatar_data FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user:
            return dict(user)
        return None
    finally:
        conn.close()

def update_user(user_id: str, username: str = None, current_password: str = None, password: str = None, avatar_data: str = None, theme: str = None):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        
        if password:
            if not current_password:
                raise ValueError("Current password is required to change password")
            cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
            if not row or row['password_hash'] != hash_password(current_password):
                raise ValueError("Incorrect current password")

        updates = []
        params = []
        if username:
            updates.append("username = %s")
            params.append(username)
        if password:
            updates.append("password_hash = %s")
            params.append(hash_password(password))
        if avatar_data is not None:
            updates.append("avatar_data = %s")
            params.append(avatar_data)
        if theme:
            updates.append("theme = %s")
            params.append(theme)
            
        if not updates:
            return True
            
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        params.append(user_id)
        
        cursor.execute(query, tuple(params))
        conn.commit()
        return True
    except IntegrityError:
        conn.rollback()
        return False
    finally:
        conn.close()

# Meta DB helpers - App
def create_workspace(user_id: str, name: str):
    conn = get_meta_connection()
    try:
        ws_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute("INSERT INTO workspaces (id, user_id, name) VALUES (%s, %s, %s)", (ws_id, user_id, name))
        conn.commit()
        return {"id": ws_id, "name": name}
    finally:
        conn.close()

def get_workspaces(user_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM workspaces WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def create_project(workspace_id: str, name: str, schema: dict = None, semantic_index: dict = None, profile: dict = None):
    conn = get_meta_connection()
    try:
        project_id = str(uuid.uuid4())
        cursor = conn.cursor()
        schema_json = json.dumps(schema) if schema else "{}"
        semantic_index_json = json.dumps(semantic_index) if semantic_index else "{}"
        profile_json = json.dumps(profile) if profile else "{}"
        learned_aliases_json = "{}"
        
        cursor.execute(
            "INSERT INTO projects (id, workspace_id, name, schema, semantic_index, learned_aliases, profile) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (project_id, workspace_id, name, schema_json, semantic_index_json, learned_aliases_json, profile_json)
        )
        
        # Create schema for this project
        schema_name = _get_project_schema_name(project_id)
        cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name}")
        
        conn.commit()
        return {"id": project_id, "workspace_id": workspace_id, "name": name}
    finally:
        conn.close()

def update_project_metadata(project_id: str, new_schema: dict, new_semantic_index: dict, new_profile: dict = None):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT schema, semantic_index, profile FROM projects WHERE id = %s", (project_id,))
        row = cursor.fetchone()
        if not row: return
        
        schema = {}
        if row["schema"]:
            try: schema = json.loads(row["schema"])
            except: pass
        schema.update(new_schema)
        
        semantic_index = {}
        if row["semantic_index"]:
            try: semantic_index = json.loads(row["semantic_index"])
            except: pass
        semantic_index.update(new_semantic_index)
        
        profile = new_profile if new_profile else {}
        if not profile and row["profile"]:
            try: profile = json.loads(row["profile"])
            except: pass
            
        cursor.execute("UPDATE projects SET schema = %s, semantic_index = %s, profile = %s WHERE id = %s", 
                       (json.dumps(schema), json.dumps(semantic_index), json.dumps(profile), project_id))
        conn.commit()
    finally:
        conn.close()

def get_projects(workspace_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, created_at, schema, semantic_index, learned_aliases, profile FROM projects WHERE workspace_id = %s ORDER BY created_at DESC", (workspace_id,))
        projects = []
        for row in cursor.fetchall():
            p = dict(row)
            try:
                if p.get("schema"): p["schema"] = json.loads(p["schema"])
                if p.get("semantic_index"): p["semantic_index"] = json.loads(p["semantic_index"])
                if p.get("learned_aliases"): p["learned_aliases"] = json.loads(p["learned_aliases"])
                if p.get("profile"): p["profile"] = json.loads(p["profile"])
            except Exception:
                pass
            projects.append(p)
        return projects
    finally:
        conn.close()

def get_project_by_id(project_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, created_at, schema, semantic_index, learned_aliases, profile FROM projects WHERE id = %s", (project_id,))
        row = cursor.fetchone()
        if row:
            p = dict(row)
            try:
                if p.get("schema"): p["schema"] = json.loads(p["schema"])
                if p.get("semantic_index"): p["semantic_index"] = json.loads(p["semantic_index"])
                if p.get("learned_aliases"): p["learned_aliases"] = json.loads(p["learned_aliases"])
                if p.get("profile"): p["profile"] = json.loads(p["profile"])
            except Exception:
                pass
            return p
        return None
    finally:
        conn.close()

def learn_alias(project_id: str, term: str, actual_column: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT learned_aliases FROM projects WHERE id = %s", (project_id,))
        row = cursor.fetchone()
        if not row: return
        
        learned_dict = {}
        if row["learned_aliases"]:
            try: learned_dict = json.loads(row["learned_aliases"])
            except Exception: pass
                
        learned_dict[term.lower()] = actual_column
        cursor.execute("UPDATE projects SET learned_aliases = %s WHERE id = %s", (json.dumps(learned_dict), project_id))
        conn.commit()
    finally:
        conn.close()

def delete_project(project_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM history WHERE project_id = %s", (project_id,))
        cursor.execute("DELETE FROM projects WHERE id = %s", (project_id,))
        
        # Drop project schema
        schema_name = _get_project_schema_name(project_id)
        cursor.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        
        conn.commit()
        return True
    finally:
        conn.close()

def delete_dataset(project_id: str, table_name: str):
    conn = get_meta_connection()
    try:
        schema_name = _get_project_schema_name(project_id)
        if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
            return False
            
        cursor = conn.cursor()
        cursor.execute(f"DROP TABLE IF EXISTS {schema_name}.{table_name} CASCADE")
        
        cursor.execute("SELECT schema, profile FROM projects WHERE id = %s", (project_id,))
        row = cursor.fetchone()
        if row:
            schema_dict = {}
            if row["schema"]:
                try: schema_dict = json.loads(row["schema"])
                except Exception: pass
            
            profile_dict = {}
            if row["profile"]:
                try: profile_dict = json.loads(row["profile"])
                except Exception: pass
                
            if table_name in schema_dict:
                del schema_dict[table_name]
            if table_name in profile_dict:
                del profile_dict[table_name]
                
            cursor.execute(
                "UPDATE projects SET schema = %s, profile = %s WHERE id = %s",
                (json.dumps(schema_dict), json.dumps(profile_dict), project_id)
            )
        
        conn.commit()
        return True
    finally:
        conn.close()

def delete_workspace(workspace_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE workspace_id = %s", (workspace_id,))
        projects = cursor.fetchall()
        for p in projects:
            delete_project(p['id'])
            
        cursor = conn.cursor()
        cursor.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def add_history(project_id: str, question: str, intent: str = None, sql: str = None, data: str = None, columns: str = None, kpis: str = None, chart_type: str = None, insights: str = None):
    conn = get_meta_connection()
    try:
        h_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (id, project_id, question, intent, sql, data, columns, kpis, chart_type, insights) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", 
            (h_id, project_id, question, intent, sql, data, columns, kpis, chart_type, insights)
        )
        
        # Auto-cleanup: Keep only the latest 20 unsaved snapshots
        cursor.execute("""
            DELETE FROM history 
            WHERE project_id = %s 
              AND is_saved = FALSE 
              AND id NOT IN (
                  SELECT id FROM history 
                  WHERE project_id = %s 
                    AND is_saved = FALSE 
                  ORDER BY created_at DESC 
                  LIMIT 20
              )
        """, (project_id, project_id))
        
        conn.commit()
        return {"id": h_id}
    finally:
        conn.close()

def save_report(history_id: str, report_name: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE history SET is_saved = TRUE, report_name = %s WHERE id = %s", (report_name, history_id))
        conn.commit()
        return True
    finally:
        conn.close()

def delete_history_item(history_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        # Ensure we delete from dashboard_widgets first if we hadn't removed it, but we removed dashboards feature.
        cursor.execute("DELETE FROM dashboard_widgets WHERE history_id = %s", (history_id,))
        cursor.execute("DELETE FROM history WHERE id = %s", (history_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def get_history(project_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, project_id, question, is_saved, report_name, created_at FROM history WHERE project_id = %s ORDER BY created_at DESC", (project_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def get_history_item(history_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM history WHERE id = %s", (history_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def update_history_ai_insights(history_id: str, ai_insights: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE history SET ai_insights = %s WHERE id = %s", (ai_insights, history_id))
        conn.commit()
    finally:
        conn.close()

def get_dashboards(workspace_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM dashboards WHERE workspace_id = %s ORDER BY created_at DESC", (workspace_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def create_dashboard(workspace_id: str, name: str):
    conn = get_meta_connection()
    try:
        d_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute("INSERT INTO dashboards (id, workspace_id, name) VALUES (%s, %s, %s)", (d_id, workspace_id, name))
        conn.commit()
        return {"id": d_id, "name": name, "workspace_id": workspace_id}
    finally:
        conn.close()

def add_dashboard_widget(dashboard_id: str, history_id: str):
    conn = get_meta_connection()
    try:
        w_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute("INSERT INTO dashboard_widgets (id, dashboard_id, history_id) VALUES (%s, %s, %s)", (w_id, dashboard_id, history_id))
        conn.commit()
        return {"id": w_id}
    finally:
        conn.close()

def get_dashboard_widgets(dashboard_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.id as widget_id, h.* 
            FROM dashboard_widgets w
            JOIN history h ON w.history_id = h.id
            WHERE w.dashboard_id = %s
            ORDER BY w.created_at ASC
        """, (dashboard_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

# --- Reports ---

def create_report(group_id: str, project_id: str, version: int, report_name: str, question: str, resolved_question: str, generated_sql: str, result_data: str, chart_type: str, chart_config: str, kpis: str, insights: str, ai_insights: str):
    conn = get_meta_connection()
    try:
        r_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO reports (id, group_id, project_id, version, report_name, question, resolved_question, generated_sql, result_data, chart_type, chart_config, kpis, insights, ai_insights)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (r_id, group_id, project_id, version, report_name, question, resolved_question, generated_sql, result_data, chart_type, chart_config, kpis, insights, ai_insights))
        conn.commit()
        return r_id
    finally:
        conn.close()

def get_reports_by_project(project_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        # Fetch only the latest version of each group
        cursor.execute("""
            SELECT r1.id, r1.group_id, r1.project_id, r1.version, r1.report_name, r1.question, r1.chart_type, r1.created_at
            FROM reports r1
            INNER JOIN (
                SELECT group_id, MAX(version) as max_version
                FROM reports
                WHERE project_id = %s
                GROUP BY group_id
            ) r2 ON r1.group_id = r2.group_id AND r1.version = r2.max_version
            ORDER BY r1.created_at DESC
        """, (project_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def get_report_by_id(report_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def get_report_versions(group_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, version, report_name, created_at FROM reports WHERE group_id = %s ORDER BY version DESC", (group_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def delete_report(report_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reports WHERE id = %s", (report_id,))
        conn.commit()
    finally:
        conn.close()

def save_query(project_id: str, name: str, sql: str, chart_type: str = "table"):
    conn = get_meta_connection()
    try:
        q_id = str(uuid.uuid4())
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO saved_queries (id, project_id, name, sql, chart_type) VALUES (%s, %s, %s, %s, %s)",
            (q_id, project_id, name, sql, chart_type)
        )
        conn.commit()
        return q_id
    finally:
        conn.close()

def get_saved_queries(project_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM saved_queries WHERE project_id = %s ORDER BY created_at DESC", (project_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def delete_saved_query(query_id: str):
    conn = get_meta_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM saved_queries WHERE id = %s", (query_id,))
        conn.commit()
    finally:
        conn.close()

_init_db_schema_once()

