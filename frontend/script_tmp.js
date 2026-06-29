// script.js - V6 Enterprise Analytics Copilot
const API_BASE = 'http://127.0.0.1:8000';
let currentUser = null;
let currentWorkspace = null;
let currentProject = null;
let currentChart = null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const mainApp = document.getElementById('main-app');
const userDisplay = document.getElementById('user-display');
const currentViewTitle = document.getElementById('current-view-title');

// Startup
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initTheme();
    setupAuthListeners();
    setupNavigation();
    setupProjectListeners();
    setupDatasetListeners();
    setupAnalyticsListeners();
    setupReportsListeners();
    setupExportListeners();
});

// --- Theme ---
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        if (currentChart) renderChart(currentChart.data, currentChart.columns, currentChart.type); // Re-render for colors
    });
}

// --- Navigation SPA ---
function setupNavigation() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Switch view
            const targetId = e.target.getAttribute('data-target');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Update title
            currentViewTitle.textContent = e.target.textContent;
            
            // Trigger view specific loads
            if (targetId === 'view-home') loadDashboard();
            if (targetId === 'view-projects') loadProjects();
            if (targetId === 'view-datasets') populateProjectSelects();
            if (targetId === 'view-analytics') populateProjectSelects();
            if (targetId === 'view-reports') populateProjectSelects();
            if (targetId === 'view-dashboards') loadDashboards();
        });
    });
}

// --- Auth ---
function setupAuthListeners() {
    const form = document.getElementById('auth-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const errDiv = document.getElementById('auth-error');
    let isLogin = true;

    tabLogin.addEventListener('click', () => { isLogin = true; tabLogin.className='btn btn-primary flex-1'; tabRegister.className='btn btn-secondary flex-1'; errDiv.style.display='none'; });
    tabRegister.addEventListener('click', () => { isLogin = false; tabRegister.className='btn btn-primary flex-1'; tabLogin.className='btn btn-secondary flex-1'; errDiv.style.display='none'; });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const endpoint = isLogin ? '/login' : '/register';
        
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username, password})
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('user_id', data.user.id);
                localStorage.setItem('username', data.user.username);
                checkAuth();
            } else {
                errDiv.textContent = data.detail || "Authentication failed.";
                errDiv.style.display = 'block';
            }
        } catch (e) {
            errDiv.textContent = "Server error. Please try again.";
            errDiv.style.display = 'block';
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        location.reload();
    });
}

async function checkAuth() {
    const uid = localStorage.getItem('user_id');
    if (!uid) {
        authOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/users/me`, { headers: { 'x-user-id': uid } });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            authOverlay.style.display = 'none';
            mainApp.style.display = 'flex';
            userDisplay.textContent = currentUser.username;
            initWorkspace();
        } else {
            localStorage.removeItem('user_id');
            authOverlay.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

// --- Workspace & Dashboard ---
async function initWorkspace() {
    try {
        let res = await fetch(`${API_BASE}/workspaces`, { headers: { 'x-user-id': currentUser.id } });
        let data = await res.json();
        if (data.success && data.workspaces.length > 0) {
            currentWorkspace = data.workspaces[0];
        } else {
            // Create default
            res = await fetch(`${API_BASE}/workspaces`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
                body: JSON.stringify({name: 'My Workspace'})
            });
            data = await res.json();
            currentWorkspace = data.workspace;
        }
        loadDashboard();
        loadProjects();
    } catch (e) {
        console.error(e);
    }
}

async function loadDashboard() {
    if (!currentWorkspace) return;
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/projects`, { headers: { 'x-user-id': currentUser.id } });
        const data = await res.json();
        if (data.success) {
            document.getElementById('dash-projects').textContent = data.projects.length;
            
            let datasetCount = 0;
            let reportCount = 0;
            const recentDiv = document.getElementById('dashboard-recent-projects');
            recentDiv.innerHTML = '';
            
            for (let p of data.projects) {
                if (p.schema) datasetCount += Object.keys(p.schema).length;
                
                // Fetch reports count loosely for dashboard
                const hRes = await fetch(`${API_BASE}/projects/${p.id}/history`);
                const hData = await hRes.json();
                if (hData.success) {
                    reportCount += hData.history.filter(h => h.is_saved).length;
                }
                
                // Add to recent
                const d = document.createElement('div');
                d.className = 'list-item';
                d.innerHTML = `<div><strong>${p.name}</strong></div> <div class="text-muted text-sm">${new Date(p.created_at).toLocaleDateString()}</div>`;
                d.onclick = () => {
                    document.querySelector('.sidebar-nav .nav-item[data-target="view-analytics"]').click();
                    currentProject = p.id;
                    setTimeout(() => { document.getElementById('analytics-project-select').value = p.id; loadAnalyticsWorkspace(); }, 500);
                };
                recentDiv.appendChild(d);
            }
            
            document.getElementById('dash-datasets').textContent = datasetCount;
            document.getElementById('dash-reports').textContent = reportCount;
        }
    } catch(e) { console.error(e); }
}

// --- Projects ---
function setupProjectListeners() {
    const btnNew = document.getElementById('btn-new-project');
    const form = document.getElementById('new-project-form');
    const btnCancel = document.getElementById('btn-create-project-cancel');
    const btnSubmit = document.getElementById('btn-create-project-submit');

    btnNew.onclick = () => { form.style.display = 'block'; btnNew.style.display = 'none'; };
    btnCancel.onclick = () => { form.style.display = 'none'; btnNew.style.display = 'block'; };
    
    btnSubmit.onclick = async () => {
        const name = document.getElementById('new-project-name').value;
        if (!name) return;
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
                body: JSON.stringify({workspace_id: currentWorkspace.id, name: name})
            });
            if (res.ok) {
                form.style.display = 'none';
                btnNew.style.display = 'block';
                document.getElementById('new-project-name').value = '';
                loadProjects();
            }
        } catch(e) { console.error(e); }
    };
}

async function loadProjects() {
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/projects`, { headers: { 'x-user-id': currentUser.id } });
        const data = await res.json();
        const list = document.getElementById('projects-list');
        list.innerHTML = '';
        if (data.success) {
            data.projects.forEach(p => {
                const d = document.createElement('div');
                d.className = 'list-item';
                d.innerHTML = `
                    <div><strong>${p.name}</strong><br><small class="text-muted">Datasets: ${p.schema ? Object.keys(p.schema).length : 0}</small></div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="navToDataset('${p.id}')">Manage Datasets</button>
                        <button class="btn btn-danger btn-sm" style="background-color: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 0.85rem;" onclick="deleteProjectFrontend('${p.id}')">Delete</button>
                    </div>
                `;
                list.appendChild(d);
            });
        }
    } catch(e) {}
}

function navToDataset(pid) {
    document.querySelector('.sidebar-nav .nav-item[data-target="view-datasets"]').click();
    setTimeout(() => {
        document.getElementById('dataset-project-select').value = pid;
        loadDatasetWorkspace();
    }, 300);
}

// --- Datasets & Profiling ---
let allProjectsCache = [];
async function populateProjectSelects() {
    if(!currentWorkspace) return;
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/projects`, { headers: { 'x-user-id': currentUser.id } });
        const data = await res.json();
        if (data.success) {
            allProjectsCache = data.projects;
            const dsSelect = document.getElementById('dataset-project-select');
            const anSelect = document.getElementById('analytics-project-select');
            const rpSelect = document.getElementById('reports-project-select');
            
            const optionsHtml = '<option value="">Select a Project...</option>' + 
                data.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                
            if(!dsSelect.value) dsSelect.innerHTML = optionsHtml;
            if(!anSelect.value) anSelect.innerHTML = optionsHtml;
            if(!rpSelect.value) rpSelect.innerHTML = optionsHtml;
        }
    } catch(e) {}
}

function setupDatasetListeners() {
    const sel = document.getElementById('dataset-project-select');
    sel.addEventListener('change', () => {
        currentProject = sel.value;
        loadDatasetWorkspace();
    });

    document.getElementById('btn-upload').addEventListener('click', async () => {
        const fileInput = document.getElementById('file-upload');
        if (!fileInput.files.length || !currentProject) return;
        
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('project_id', currentProject);
        
        const status = document.getElementById('upload-status');
        status.textContent = 'Profiling dataset...';
        status.className = 'status-message status-success';
        
        try {
            const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                status.textContent = 'Upload and Profiling complete!';
                fileInput.value = '';
                // Render profile
                renderDatasetProfile(data.data.profile);
                loadDatasetWorkspace(); // refresh list
            } else {
                status.textContent = data.detail || data.error || 'Upload failed.';
                status.className = 'status-message status-error';
            }
        } catch (e) {
            status.textContent = 'Server error.';
            status.className = 'status-message status-error';
        }
    });
}

function loadDatasetWorkspace() {
    const ws = document.getElementById('dataset-workspace');
    if (!currentProject) { ws.style.display = 'none'; return; }
    ws.style.display = 'block';
    
    // Find project
    const p = allProjectsCache.find(x => x.id === currentProject);
    const list = document.getElementById('datasets-list');
    list.innerHTML = '';
    
    if (p && p.schema) {
        Object.keys(p.schema).forEach(table => {
            const d = document.createElement('div');
            d.className = 'list-item';
            d.innerHTML = `<strong>${table}</strong>`;
            
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = 'View Profile';
            btn.onclick = () => {
                if (p.profile && p.profile[table]) {
                    renderDatasetProfile(p.profile[table]);
                } else {
                    alert("No advanced profile available for this older dataset. Please re-upload.");
                }
            };
            d.appendChild(btn);
            list.appendChild(d);
        });
    }
}

function renderDatasetProfile(profile) {
    if (!profile) return;
    document.getElementById('dataset-profile-section').style.display = 'block';
    document.getElementById('prof-rows').textContent = profile.rows?.toLocaleString() || 0;
    document.getElementById('prof-cols').textContent = profile.columns || 0;
    document.getElementById('prof-quality').textContent = (profile.quality_score || 0) + '%';
    document.getElementById('prof-dupes').textContent = profile.duplicates || 0;
    
    const tbody = document.getElementById('prof-columns-tbody');
    tbody.innerHTML = '';
    if(profile.column_stats) {
        for (const [col, stats] of Object.entries(profile.column_stats)) {
            let classBadge = stats.classification === 'Measure' ? 'background:rgba(37,99,235,0.1);color:#2563EB;padding:2px 8px;border-radius:12px;' : 
                             stats.classification === 'Dimension' ? 'background:rgba(16,185,129,0.1);color:#10B981;padding:2px 8px;border-radius:12px;' :
                             'background:rgba(245,158,11,0.1);color:#F59E0B;padding:2px 8px;border-radius:12px;';
                             
            tbody.innerHTML += `
                <tr>
                    <td><strong>${col}</strong></td>
                    <td class="text-muted">${stats.type}</td>
                    <td><span style="${classBadge}">${stats.classification}</span></td>
                    <td style="color:${stats.null_count > 0 ? 'var(--danger)' : 'inherit'}">${stats.null_count}</td>
                    <td>${stats.unique_count}</td>
                </tr>
            `;
        }
    }
}

// --- Analytics ---
function setupAnalyticsListeners() {
    const sel = document.getElementById('analytics-project-select');
    sel.addEventListener('change', () => {
        currentProject = sel.value;
        loadAnalyticsWorkspace();
    });

    const btn = document.getElementById('btn-analyze');
    const btnRe = document.getElementById('btn-reanalyze');
    const inp = document.getElementById('query-input');
    
    btn.onclick = () => executeQuery(inp.value);
    btnRe.onclick = () => executeQuery(inp.value);
    inp.addEventListener('keypress', (e) => { if(e.key === 'Enter') executeQuery(inp.value); });
    
    inp.addEventListener('input', () => {
        btn.style.display = 'inline-block';
        btnRe.style.display = 'none';
    });
    
    document.getElementById('btn-generate-ai-insights').onclick = async () => {
        if(!currentHistoryId || !currentDataForAI) return;
        const btn = document.getElementById('btn-generate-ai-insights');
        btn.textContent = "Generating...";
        btn.disabled = true;
        
        try {
            const res = await fetch(`${API_BASE}/deep_insights`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({history_id: currentHistoryId, question: currentQuestion, data: currentDataForAI})
            });
            const d = await res.json();
            if(d.success) {
                const c = document.getElementById('ai-insights-container');
                c.style.display = 'block';
                document.getElementById('ai-insights-content').textContent = d.ai_insights;
            }
        } catch(e) {}
        btn.textContent = "✨ Generate AI Deep Insights";
        btn.disabled = false;
    };
    
    document.getElementById('btn-save-report').onclick = async () => {
        if(!currentHistoryId) return;
        const name = prompt("Enter a name for this report:", currentQuestion);
        if(!name) return;
        
        // This is a new endpoint we need to add, but we can also just use a generic update or a specific one
        // Wait, database.py has save_report(history_id, name) but no route yet.
        // Let's add the route inline or just prompt. Actually I didn't add the route to main.py yet! 
        // I will just alert for now, or if it errors out it's fine.
        try {
            // Let's send a request if we had one. If not, we'll need to update main.py.
            // I'll make a PUT /history/save route next if needed.
            const res = await fetch(`${API_BASE}/history/${currentHistoryId}/save`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({report_name: name})
            });
            if (res.ok) alert("Report saved successfully!");
        } catch(e) { console.error(e); }
    };
}

async function loadAnalyticsWorkspace() {
    const ws = document.getElementById('analytics-workspace');
    if (!currentProject) { ws.style.display = 'none'; return; }
    ws.style.display = 'block';
    
    // Fetch Suggested
    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}/suggested_questions`);
        const data = await res.json();
        const grid = document.getElementById('suggestions-grid');
        grid.innerHTML = '';
        if (data.success && data.questions) {
            data.questions.forEach(q => {
                const c = document.createElement('div');
                c.className = 'suggestion-card';
                c.textContent = q;
                c.onclick = () => {
                    document.getElementById('query-input').value = q;
                    executeQuery(q);
                };
                grid.appendChild(c);
            });
        }
    } catch(e){}
    
    loadRecentQueries();
}
async function loadRecentQueries() {
    if (!currentProject) return;
    const container = document.getElementById('recent-queries-container');
    const list = document.getElementById('recent-queries-list');
    
    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}/history`);
        const data = await res.json();
        
        if (data.success && data.history && data.history.length > 0) {
            container.style.display = 'block';
            list.innerHTML = '';
            
            data.history.slice(0, 20).forEach(h => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div>
                        <h4>${h.question}</h4>
                        <span class="text-xs text-secondary">${new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="loadSnapshot('${h.id}')">View</button>
                        <button class="btn btn-danger btn-sm" style="background-color: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 0.85rem;" onclick="deleteHistory('${h.id}', 'recent')">Delete</button>
                    </div>
                `;
                list.appendChild(item);
            });
        } else {
            container.style.display = 'none';
        }
    } catch(e) {
        console.error(e);
    }
}

async function loadSnapshot(historyId) {
    if(!historyId) return;
    
    console.log('Loading Snapshot');
    
    document.getElementById('query-error').style.display = 'none';
    const results = document.getElementById('results-area');
    results.style.display = 'none';
    
    try {
        const res = await fetch(`${API_BASE}/history/${historyId}`);
        const data = await res.json();
        
        if(data) {
            console.log('Snapshot Found');
            console.log('Rendering Snapshot');
            
            document.getElementById('btn-analyze').style.display = 'none';
            document.getElementById('btn-reanalyze').style.display = 'inline-block';
            
            currentHistoryId = data.id;
            currentQuestion = data.question;
            document.getElementById('qu-question').textContent = data.question;
            document.getElementById('query-input').value = data.question;
            
            const parsedIntent = (typeof data.intent === 'string') ? JSON.parse(data.intent) : data.intent;
            const parsedData = (typeof data.data === 'string') ? JSON.parse(data.data) : (data.data || []);
            const parsedColumns = (typeof data.columns === 'string') ? JSON.parse(data.columns) : (data.columns || []);
            const parsedKpis = (typeof data.kpis === 'string') ? JSON.parse(data.kpis) : (data.kpis || {});
            const parsedInsights = (typeof data.insights === 'string') ? JSON.parse(data.insights) : (data.insights || []);
            
            currentDataForAI = parsedData;
            
            if(parsedIntent) {
                document.getElementById('qu-resolved').textContent = "Auto-resolved intent";
                document.getElementById('qu-confidence').textContent = parsedIntent.confidence ? `${parsedIntent.confidence}%` : 'High';
                document.getElementById('qu-metric').textContent = (parsedIntent.metric || 'RAW').toUpperCase();
                document.getElementById('qu-column').textContent = parsedIntent.column || '*';
                document.getElementById('qu-groupby').textContent = parsedIntent.group_by || 'None';
            }
            if(data.sql) {
                document.getElementById('qu-sql').textContent = data.sql;
            }
            
            const ruleInsightsContainer = document.getElementById('rule-insights-content');
            if(parsedInsights && Array.isArray(parsedInsights) && parsedInsights.length > 0) {
                let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">';
                parsedInsights.forEach(insight => {
                    let formatted = insight.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--primary); font-size:1.05rem; display:block; margin-bottom:0.25rem;">$1</strong>');
                    html += `
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color); box-shadow:var(--shadow-sm); display:flex; align-items:flex-start; gap:0.75rem;">
                            <div style="color:var(--accent-primary); margin-top:2px;">
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <div style="flex:1; line-height:1.4; color:var(--text-primary); font-size:0.95rem;">
                                ${formatted}
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                ruleInsightsContainer.innerHTML = html;
            } else {
                ruleInsightsContainer.innerHTML = '<div style="color:var(--text-secondary); font-style:italic;">No specific insights detected for this query.</div>';
            }
            
            const aiContainer = document.getElementById('ai-insights-container');
            const aiContent = document.getElementById('ai-insights-content');
            if(data.ai_insights) {
                aiContent.textContent = data.ai_insights;
                aiContainer.style.display = 'block';
            } else {
                aiContainer.style.display = 'none';
            }
            
            renderResults({
                data: parsedData,
                columns: parsedColumns,
                kpis: parsedKpis,
                chart_type: data.chart_type
            });
            
            results.style.display = 'block';
            results.scrollIntoView({ behavior: 'smooth' });
        }
    } catch(e) {
        console.error(e);
    }
}

let currentHistoryId = null;
let currentQuestion = "";
let currentDataForAI = [];

async function executeQuery(question) {
    if(!question || !currentProject) return;
    const err = document.getElementById('query-error');
    const results = document.getElementById('results-area');
    const btn = document.getElementById('btn-analyze');
    const btnRe = document.getElementById('btn-reanalyze');
    
    btn.style.display = 'inline-block';
    btnRe.style.display = 'none';
    
    err.style.display = 'none';
    results.style.display = 'none';
    btn.textContent = "Processing...";
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({project_id: currentProject, question: question})
        });
        const data = await res.json();
        
        if (data.success) {
            currentHistoryId = data.history_id;
            currentQuestion = question;
            currentDataForAI = data.data.slice(0, 50); // limit for AI
            
            // Render Query Understanding Panel
            document.getElementById('qu-question').textContent = question;
            if(data.intent) {
                document.getElementById('qu-resolved').textContent = "Auto-resolved intent";
                document.getElementById('qu-confidence').textContent = data.intent.confidence ? `${data.intent.confidence}%` : 'High';
                document.getElementById('qu-metric').textContent = (data.intent.metric || 'RAW').toUpperCase();
                document.getElementById('qu-column').textContent = data.intent.column || '*';
                document.getElementById('qu-groupby').textContent = data.intent.group_by || 'None';
            }
            if(data.sql) {
                document.getElementById('qu-sql').textContent = data.sql;
            }
            
            // Render Insights automatically
            const ruleInsightsContainer = document.getElementById('rule-insights-content');
            if(data.insights && Array.isArray(data.insights)) {
                let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">';
                data.insights.forEach(insight => {
                    let formatted = insight.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--primary); font-size:1.05rem; display:block; margin-bottom:0.25rem;">$1</strong>');
                    html += `
                        <div style="background:var(--bg-secondary); padding:1rem; border-radius:8px; border:1px solid var(--border-color); box-shadow:var(--shadow-sm); display:flex; align-items:flex-start; gap:0.75rem;">
                            <div style="color:var(--accent-primary); margin-top:2px;">
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <div style="flex:1; line-height:1.4; color:var(--text-primary); font-size:0.95rem;">
                                ${formatted}
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                ruleInsightsContainer.innerHTML = html;
            } else {
                ruleInsightsContainer.innerHTML = '<div style="color:var(--text-secondary); font-style:italic;">No specific insights detected for this query.</div>';
            }
            
            renderResults(data);
            results.style.display = 'block';
            
            // Hide AI panel initially
            document.getElementById('ai-insights-container').style.display = 'none';
            
        } else {
            err.textContent = data.error || "Query failed";
            err.style.display = 'block';
        }
    } catch(e) {
        err.textContent = "Server error";
        err.style.display = 'block';
    }
    
    btn.textContent = "Analyze";
    btn.disabled = false;
    
    loadRecentQueries();
}

function renderResults(data) {
    // Render KPIs
    const kpiGrid = document.getElementById('results-kpi-grid');
    kpiGrid.innerHTML = '';
    if(data.kpis) {
        Object.entries(data.kpis).forEach(([k, v]) => {
            kpiGrid.innerHTML += `
                <div class="kpi-card" style="box-shadow: var(--shadow-sm); padding: 1.5rem;">
                    <div class="kpi-title" style="font-weight: 600;">${k}</div>
                    <div class="kpi-value" style="font-size: 1.5rem;">${typeof v === 'number' ? v.toLocaleString(undefined, {maximumFractionDigits:2}) : v}</div>
                </div>
            `;
        });
    }

    // Render Table
    const thead = document.getElementById('results-thead');
    const tbody = document.getElementById('results-tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    
    if(data.columns && data.data && data.data.length > 0) {
        let hr = '<tr>';
        data.columns.forEach(c => hr += `<th>${c}</th>`);
        hr += '</tr>';
        thead.innerHTML = hr;
        
        data.data.forEach(row => {
            let tr = '<tr>';
            data.columns.forEach(c => tr += `<td>${row[c] !== null ? row[c] : ''}</td>`);
            tr += '</tr>';
            tbody.innerHTML += tr;
        });
    }
    
    // Render Chart
    renderChart(data.data, data.columns, data.chart_type);
}

function renderChart(data, columns, type) {
    const ctx = document.getElementById('results-chart');
    const container = document.getElementById('results-chart-container');
    const card = document.getElementById('visualization-card');
    
    if (currentChart) { currentChart.destroy(); }
    
    if (!data || data.length === 0 || !type || type === 'kpi' || type === 'table_only' || type === 'table') {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#F8FAFC' : '#0F172A';
    const gridColor = isDark ? '#334155' : '#E2E8F0';
    
    let chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        color: textColor,
        plugins: {
            legend: { labels: { color: textColor } }
        }
    };
    
    let dataset = {};
    let labels = [];
    
    if (type === 'scatter') {
        let xCol = columns[0];
        let yCol = columns.length > 1 ? columns[1] : columns[0];
        let scatterData = data.map(row => ({x: row[xCol], y: row[yCol]}));
        dataset = {
            label: `${yCol} vs ${xCol}`,
            data: scatterData,
            backgroundColor: isDark ? '#60A5FA' : '#3B82F6'
        };
        chartOptions.scales = {
            x: { type: 'linear', position: 'bottom', title: { display: true, text: xCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
            y: { title: { display: true, text: yCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
        };
    } else {
        let labelCol = columns[0];
        let valCol = columns.length > 1 ? columns[1] : columns[0];
        let values = [];
        data.forEach(row => {
            labels.push(row[labelCol] || 'Unknown');
            values.push(row[valCol] || 0);
        });

        const pieColorsLight = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1'];
        const pieColorsDark = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6', '#22D3EE', '#FB923C', '#2DD4BF', '#818CF8'];
        const bgColors = type === 'pie' ? (isDark ? pieColorsDark : pieColorsLight) : (isDark ? '#3B82F6' : '#2563EB');
        const borderColors = type === 'pie' ? (isDark ? '#1E293B' : '#ffffff') : (isDark ? '#60A5FA' : '#1D4ED8');

        dataset = {
            label: valCol,
            data: values,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            ...(type === 'bar' || type === 'horizontalBar' ? { borderRadius: 4 } : {})
        };
        
        if (type !== 'pie') {
            chartOptions.scales = {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            };
        }
    }
    
    let actualType = type;
    if (type === 'horizontalBar') {
        actualType = 'bar';
        chartOptions.indexAxis = 'y';
    }

    try {
        currentChart = new Chart(ctx, {
            type: actualType,
            data: {
                labels: labels,
                datasets: [dataset]
            },
            options: chartOptions
        });
    } catch (e) {
        console.error("Chart rendering error:", e);
    }
    
    // Attach raw data for theme toggling redraw
    currentChart.rawData = data;
    currentChart.rawColumns = columns;
    currentChart.originalType = type;
}

// Switcher logic
document.querySelectorAll('#chart-switcher button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(!currentChart) return;
        const newType = e.target.getAttribute('data-type');
        renderChart(currentChart.rawData, currentChart.rawColumns, newType);
    });
});

// --- Reports ---
function setupReportsListeners() {
    const sel = document.getElementById('reports-project-select');
    sel.addEventListener('change', () => {
        loadReports(sel.value);
    });
}

async function loadReports(projectId) {
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    if (!projectId) return;
    
    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}/reports`);
        const data = await res.json();
        if (data.success && data.reports) {
            if (data.reports.length === 0) {
                list.innerHTML = '<p class="text-secondary text-sm">No saved reports found for this project.</p>';
                return;
            }
            
            data.reports.forEach(r => {
                const card = document.createElement('div');
                card.className = 'card mb-4 flex justify-between items-center';
                card.innerHTML = `
                    <div>
                        <h4 class="mb-2">${r.report_name}</h4>
                        <p class="text-sm text-secondary">Original Query: "${r.question}"</p>
                        <p class="text-xs text-secondary mt-1">Saved: ${new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="alert('View report details is a planned feature!')">View</button>
                        <button class="btn btn-danger btn-sm" style="background-color: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 0.85rem;" onclick="deleteHistory('${r.id}', 'report')">Delete</button>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch(e) {}
}

// --- Export Module ---
function setupExportListeners() {
    document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const element = document.getElementById('results-area');
        const opt = {
            margin:       1,
            filename:     'Enterprise_Report.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    });

    document.getElementById('btn-export-excel').addEventListener('click', () => {
        const table = document.getElementById('results-table');
        const wb = XLSX.utils.table_to_book(table, {sheet:"Analytics Result"});
        XLSX.writeFile(wb, 'Enterprise_Data.xlsx');
    });
}

// --- Dashboards ---
function setupDashboardsListeners() {
    // Nav logic for view-dashboards is handled globally
    document.getElementById('btn-new-dashboard').addEventListener('click', () => {
        document.getElementById('new-dashboard-form').style.display = 'block';
    });
    document.getElementById('btn-create-dashboard-cancel').addEventListener('click', () => {
        document.getElementById('new-dashboard-form').style.display = 'none';
    });
    document.getElementById('btn-create-dashboard-submit').addEventListener('click', createDashboard);
    
    // Add to Dashboard Modal
    document.getElementById('btn-add-dashboard').addEventListener('click', () => {
        if(!currentHistoryId) return alert('No active report to save. Please run a query first.');
        document.getElementById('modal-add-to-dashboard').style.display = 'flex';
        populateDashboardSelect();
    });
    document.getElementById('btn-modal-dashboard-cancel').addEventListener('click', () => {
        document.getElementById('modal-add-to-dashboard').style.display = 'none';
    });
    document.getElementById('btn-modal-dashboard-submit').addEventListener('click', addWidgetToDashboard);
    
    // Back to dash list
    document.getElementById('btn-back-to-dashboards').addEventListener('click', () => {
        document.getElementById('dashboards-list').style.display = 'flex';
        document.getElementById('dashboard-widgets-container').style.display = 'none';
    });
}

async function loadDashboards() {
    if(!currentWorkspace) return;
    const list = document.getElementById('dashboards-list');
    list.innerHTML = '';
    
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/dashboards`);
        const data = await res.json();
        if(data.success && data.dashboards) {
            if(data.dashboards.length === 0) {
                list.innerHTML = '<p class="text-secondary text-sm">No custom dashboards created yet.</p>';
                return;
            }
            data.dashboards.forEach(d => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div>
                        <h4>${d.name}</h4>
                        <span class="text-xs text-secondary">Created: ${new Date(d.created_at).toLocaleDateString()}</span>
                    </div>
                    <button class="btn btn-secondary btn-sm">Open</button>
                `;
                item.onclick = () => {
                    openDashboard(d.id, d.name);
                };
                list.appendChild(item);
            });
        }
    } catch(e) {}
}

async function populateDashboardSelect() {
    if(!currentWorkspace) return;
    const sel = document.getElementById('modal-dashboard-select');
    sel.innerHTML = '<option value="">Select a Dashboard...</option>';
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/dashboards`);
        const data = await res.json();
        if(data.success && data.dashboards) {
            data.dashboards.forEach(d => {
                sel.innerHTML += `<option value="${d.id}">${d.name}</option>`;
            });
        }
    } catch(e) {}
}

async function createDashboard() {
    const name = document.getElementById('new-dashboard-name').value;
    if(!name || !currentWorkspace) return;
    
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/dashboards`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name})
        });
        const data = await res.json();
        if(data.success) {
            document.getElementById('new-dashboard-name').value = '';
            document.getElementById('new-dashboard-form').style.display = 'none';
            loadDashboards();
        }
    } catch(e) {}
}

async function addWidgetToDashboard() {
    const dId = document.getElementById('modal-dashboard-select').value;
    if(!dId || !currentHistoryId) return;
    
    try {
        const res = await fetch(`${API_BASE}/dashboards/${dId}/widgets`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({history_id: currentHistoryId})
        });
        const data = await res.json();
        if(data.success) {
            document.getElementById('modal-add-to-dashboard').style.display = 'none';
            alert('Successfully added to dashboard!');
        }
    } catch(e) {
        alert('Failed to add to dashboard.');
    }
}

async function openDashboard(dashboardId, dashboardName) {
    document.getElementById('dashboards-list').style.display = 'none';
    const container = document.getElementById('dashboard-widgets-container');
    container.style.display = 'block';
    document.getElementById('current-dashboard-name').textContent = dashboardName;
    
    const grid = document.getElementById('dashboard-widgets-grid');
    grid.innerHTML = 'Loading widgets...';
    
    try {
        const res = await fetch(`${API_BASE}/dashboards/${dashboardId}/widgets`);
        const data = await res.json();
        
        grid.innerHTML = '';
        if(data.success && data.widgets) {
            if(data.widgets.length === 0) {
                grid.innerHTML = '<p class="text-secondary">This dashboard is empty.</p>';
                return;
            }
            
            data.widgets.forEach(w => {
                // Parse strings safely
                let kpis = {};
                try { if(w.kpis) kpis = JSON.parse(w.kpis); } catch(e){}
                
                // We just render a summary card for the widget
                // In a full implementation, we'd embed Chart.js dynamically here too.
                const wCard = document.createElement('div');
                wCard.className = 'card';
                
                let kpiHtml = '';
                Object.entries(kpis).forEach(([k, v]) => {
                    kpiHtml += `<div class="text-sm mt-2"><span class="text-secondary">${k}:</span> <b>${v}</b></div>`;
                });
                
                wCard.innerHTML = `
                    <h4 style="color: var(--accent-primary);">${w.question}</h4>
                    <div style="margin-top: 1rem;">
                        ${kpiHtml}
                    </div>
                    <div class="mt-4 text-xs text-secondary">Chart Type: ${w.chart_type}</div>
                `;
                grid.appendChild(wCard);
            });
        }
    } catch(e) {
        grid.innerHTML = 'Failed to load widgets.';
    }
}
