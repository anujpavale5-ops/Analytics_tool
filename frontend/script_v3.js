// script.js - V6 Enterprise Analytics Copilot
const API_BASE = "https://analytics-tool-n3t6.onrender.com";
let currentUser = null;
let currentWorkspace = null;
let currentProject = null;
let currentChart = null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const mainApp = document.getElementById('main-app');
const userDisplay = document.getElementById('user-display');


// Startup
document.addEventListener('DOMContentLoaded', () => {
    // Chart Defaults
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
        Chart.defaults.font.size = 12;
    }

    checkAuth();
    
    setupAuthListeners();
    setupNavigation();
    setupProjectListeners();
    setupDatasetListeners();
    setupAnalyticsListeners();
    setupReportsListeners();
    setupExportListeners();
    setupHorizontalResizers();
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
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('app-sidebar').classList.toggle('collapsed');
        });
    }

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnTarget = e.currentTarget;
            // Update active state
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
            btnTarget.classList.add('active');
            
            // Switch view
            const targetId = btnTarget.getAttribute('data-target');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Update title
            const navText = btnTarget.querySelector('.nav-text').textContent;
            
            
            // Trigger view specific loads
            if (targetId === 'view-home') loadDashboard();
            if (targetId === 'view-projects') loadProjects();
            if (targetId === 'view-datasets') populateProjectSelects();
            if (targetId === 'view-analytics') populateProjectSelects();
            if (targetId === 'view-sql') {
                populateProjectSelects();
                // If Monaco was initialized while hidden, it has 0x0 layout. 
                // We MUST call layout() when it becomes visible.
                if (window.sqlEditorInstance) {
                    setTimeout(() => window.sqlEditorInstance.layout(), 50);
                }
            }
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
                showErrorElement(errDiv, data.detail || "Authentication failed.", "Authentication Error");
                
            }
        } catch (e) {
            showErrorElement(errDiv, "Server error. Please try again.", "Connection Error");
            
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        document.getElementById('logout-modal').style.display = 'flex';
    });

    document.getElementById('btn-cancel-logout').addEventListener('click', () => {
        document.getElementById('logout-modal').style.display = 'none';
    });

    document.getElementById('btn-confirm-logout').addEventListener('click', () => {
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
            const errDiv = document.getElementById('auth-error');
            if (errDiv) {
                showErrorElement(errDiv, "Session expired or invalid user. Please login again.", "Session Error");
            }
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
                const rRes = await fetch(`${API_BASE}/projects/${p.id}/reports`);
                const rData = await rRes.json();
                if (rData.success && rData.reports) {
                    reportCount += rData.reports.length;
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
    if(!currentWorkspace) {
        showToast("No current workspace.", "error");
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/workspaces/${currentWorkspace.id}/projects`, { headers: { 'x-user-id': currentUser.id } });
        const data = await res.json();
        if (data.success) {
            allProjectsCache = data.projects;
            
            const updateSelect = (selectId, defaultText) => {
                const select = document.getElementById(selectId);
                if (!select) return;
                
                const currentVal = select.value;
                const optionsHtml = '<option value=">' + defaultText + '</option>' + 
                    data.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                
                select.innerHTML = optionsHtml;
                
                // Restore selection if it still exists
                if (currentVal && Array.from(select.options).some(opt => opt.value === currentVal)) {
                    select.value = currentVal;
                }
            };

            updateSelect('dataset-project-select', 'Select a Project...');
            updateSelect('analytics-project-select', 'Select a Project to Analyze...');
            updateSelect('reports-project-select', 'Select a Project...');
            updateSelect('sql-project-select', 'Select a Project...');
            
            if(data.projects.length === 0) {
                showToast("0 projects found in this workspace.", "info");
            }
        } else {
            showToast("Failed to load projects: " + data.detail, "error");
        }
    } catch(e) {
        console.error('Error populating project selects:', e);
        showToast("Network error fetching projects: " + e.message, "error");
    }
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
                renderDatasetProfile(data.data.profile, currentProject, data.data.table_name, data.data.preview);
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
            
            const actionDiv = document.createElement('div');
            actionDiv.style.display = 'flex';
            actionDiv.style.gap = '8px';
            
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary btn-sm';
            btn.textContent = 'View Profile';
            btn.onclick = () => {
                if (p.profile && p.profile[table]) {
                    renderDatasetProfile(p.profile[table], p.id, table);
                } else {
                    showToast("No advanced profile available for this older dataset. Please re-upload.");
                }
            };
            
            const btnDel = document.createElement('button');
            btnDel.className = 'btn btn-danger btn-sm';
            btnDel.textContent = 'Delete';
            btnDel.style.cssText = 'background-color: #ef4444; color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 0.85rem;';
            btnDel.onclick = () => {
                deleteDatasetFrontend(currentProject, table);
            };
            
            actionDiv.appendChild(btn);
            actionDiv.appendChild(btnDel);
            d.appendChild(actionDiv);
            list.appendChild(d);
        });
    }
}

async function deleteDatasetFrontend(projectId, tableName) {
    if(!confirm(`Are you sure you want to delete dataset "${tableName}"?`)) return;
    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}/datasets/${tableName}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            // Need to update the local cache
            const p = allProjectsCache.find(x => x.id === projectId);
            if(p) {
                if(p.schema && p.schema[tableName]) delete p.schema[tableName];
                if(p.profile && p.profile[tableName]) delete p.profile[tableName];
            }
            loadDatasetWorkspace();
            loadProjects(); // refresh projects list dataset count
        } else {
            showToast('Failed to delete dataset.');
        }
    } catch(e) {
        showToast('Error deleting dataset.');
    }
}

function renderDatasetProfile(profile, projectId, tableName, previewData = null) {
    if (!profile) return;
    document.getElementById('dataset-profile-section').style.display = 'block';
    document.getElementById('prof-rows').textContent = (profile.rows ? profile.rows.toLocaleString() : 0) || 0;
    document.getElementById('prof-cols').textContent = profile.columns || 0;
    document.getElementById('prof-quality').textContent = (profile.quality_score || 0) + '%';
    document.getElementById('prof-dupes').textContent = profile.duplicates || 0;
    
    const tbody = document.getElementById('prof-columns-tbody');
    tbody.innerHTML = '';
    if(profile.column_stats) {
        for (const [col, stats] of Object.entries(profile.column_stats)) {
            let classBadge = stats.classification === 'Measure' ? 'background:rgba(37,99,235,0.1);color:#2563EB;padding:2px 8px;border-radius:12px;' : 
                             stats.classification === 'Dimension' ? 'background:rgba(16,185,129,0.1);color:#10B981;padding:2px 8px;border-radius:12px;' :
                             stats.classification === 'PERSON/ENTITY' ? 'background:rgba(139,92,246,0.1);color:#8B5CF6;padding:2px 8px;border-radius:12px;' :
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

    // Handle Data Preview
    const previewCard = document.getElementById('dataset-preview-card');
    const thd = document.getElementById('preview-thead');
    const tbd = document.getElementById('preview-tbody');
    
    const renderPreview = (data) => {
        if (!data || data.length === 0) {
            previewCard.style.display = 'none';
            return;
        }
        previewCard.style.display = 'block';
        
        const cols = Object.keys(data[0]);
        thd.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
        
        tbd.innerHTML = data.map(row => {
            return '<tr>' + cols.map(c => `<td>${row[c] !== null ? row[c] : ''}</td>`).join('') + '</tr>';
        }).join('');
    };

    if (previewData) {
        renderPreview(previewData);
    } else if (projectId && tableName) {
        previewCard.style.display = 'block';
        thd.innerHTML = '<tr><th><div class="skeleton-text w-full"></div></th></tr>';
        tbd.innerHTML = '';
        fetch(`${API_BASE}/projects/${projectId}/tables/${tableName}/data`)
            .then(res => res.json())
            .then(d => {
                if (d.success) renderPreview(d.data);
                else previewCard.style.display = 'none';
            })
            .catch(() => previewCard.style.display = 'none');
    } else {
        previewCard.style.display = 'none';
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
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-bottom: 2px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>Generate AI Deep Insights';
        btn.disabled = false;
    };
    
    document.getElementById('btn-save-report').onclick = async () => {
        if(!currentHistoryId) return;
        const name = prompt("Enter a name for this report:", currentQuestion);
        if(!name) return;
        
        try {
            const res = await fetch(`${API_BASE}/reports/save?history_id=${currentHistoryId}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({report_name: name})
            });
            const data = await res.json();
            if (data.success) {
                showToast("Report saved successfully!");
                // Reload home page stats
                loadProjects();
                // Optionally reload reports list if it's active
                if(currentProjectId) loadReports(currentProjectId);
            } else {
                showToast("Failed to save report.", "error");
            }
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
    const banner = document.getElementById('confidence-banner');
    if(banner) banner.style.display = 'none';
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
            
            const conf = data.confidence || (data.intent && data.intent.confidence) || 0;
            const badge = document.getElementById('confidence-badge');
            const banner = document.getElementById('confidence-banner');
            
            if(badge) {
                badge.textContent = `Confidence: ${conf}%`;
                if(conf >= 90) {
                    badge.style.background = '#10B981'; // green
                    if(banner) banner.style.display = 'none';
                } else if(conf >= 70) {
                    badge.style.background = '#F59E0B'; // orange
                    if(banner) banner.style.display = 'block';
                } else {
                    badge.style.background = '#EF4444'; // red
                    if(banner) banner.style.display = 'none'; // Error handles below 70 usually, but just in case
                }
            }
            
            if(data.intent) {
                document.getElementById('qu-resolved').textContent = "Auto-resolved intent";
                document.getElementById('qu-confidence').textContent = `${conf}%`;
                
                // Try to extract metrics safely (V7 format uses metrics list, but fallback to metric)
                let metricStr = 'RAW';
                if (data.intent.metrics && data.intent.metrics.length > 0) {
                    metricStr = data.intent.metrics.map(m => m.aggregation).join(', ');
                } else if (data.intent.metric) {
                    metricStr = data.intent.metric;
                }
                document.getElementById('qu-metric').textContent = metricStr.toUpperCase();
                
                let colStr = '*';
                if (data.intent.metrics && data.intent.metrics.length > 0) {
                    colStr = data.intent.metrics.map(m => m.column).join(', ');
                } else if (data.intent.column) {
                    colStr = data.intent.column;
                }
                document.getElementById('qu-column').textContent = colStr;
                
                let groupStr = 'None';
                if (data.intent.group_by && data.intent.group_by.length > 0) {
                    groupStr = Array.isArray(data.intent.group_by) ? data.intent.group_by.join(', ') : data.intent.group_by;
                }
                document.getElementById('qu-groupby').textContent = groupStr;
            }
            if(data.sql) {
                document.getElementById('qu-sql').textContent = data.sql;
                
                // V10.1 Generated SQL Panel update
                const genSqlPanel = document.getElementById('generated-sql-panel');
                if (genSqlPanel) {
                    genSqlPanel.style.display = 'block';
                    document.getElementById('generated-sql-code').textContent = data.sql;
                    document.getElementById('sql-exec-time').textContent = `Execution Time: ${data.execution_time_ms || 0}ms`;
                    document.getElementById('sql-rows-returned').textContent = `Rows Returned: ${data.row_count || data.data.length || 0}`;
                    document.getElementById('sql-chart-selected').textContent = `Chart Selected: ${data.chart_type ? data.chart_type.charAt(0).toUpperCase() + data.chart_type.slice(1) : 'Table'}`;
                    
                    document.getElementById('btn-open-sql-editor').onclick = () => {
                        switchView('view-sql');
                        document.getElementById('sql-project-select').value = currentProject;
                        document.getElementById('sql-editor-input').value = data.sql;
                        loadSchemaForSqlEditor(currentProject);
                        // Auto-run if desired, or let user click Run. For now let them modify.
                    };
                }
            } else {
                const genSqlPanel = document.getElementById('generated-sql-panel');
                if (genSqlPanel) genSqlPanel.style.display = 'none';
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
            showErrorElement(err, data.error || "Query failed", "Analysis Error");
            
        }
    } catch(e) {
        showErrorElement(err, "Server error", "Connection Error");
        
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
    
    if (currentChart) { currentChart.destroy(); currentChart = null; }
    
    // Store globally so the switcher can still use it when in 'table' mode
    window.lastChartData = data;
    window.lastChartColumns = columns;
    
    if (!data || data.length === 0 || !type || type === 'kpi' || type === 'table_only') {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    if (type === 'table') {
        container.style.display = 'none';
        return;
    } else {
        container.style.display = 'block';
    }
    
    card.style.display = 'block';
    
    const isDark = true; // App is Enterprise Dark Theme ONLY
    const textColor = '#F8FAFC';
    const gridColor = 'rgba(255, 255, 255, 0.1)';
    
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
        let isXNumeric = data.length > 0 && typeof data[0][xCol] === 'number';
        
        let scatterData = data.map(row => ({x: row[xCol], y: row[yCol]}));
        dataset = {
            label: `${yCol} vs ${xCol}`,
            data: scatterData,
            backgroundColor: isDark ? '#60A5FA' : '#3B82F6'
        };
        chartOptions.scales = {
            x: { type: isXNumeric ? 'linear' : 'category', position: 'bottom', title: { display: true, text: xCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
            y: { type: 'linear', title: { display: true, text: yCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
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
        const isPieOrDoughnut = type === 'pie' || type === 'doughnut';
        const bgColors = isPieOrDoughnut ? (isDark ? pieColorsDark : pieColorsLight) : (isDark ? '#3B82F6' : '#2563EB');
        const borderColors = isPieOrDoughnut ? (isDark ? '#1E293B' : '#ffffff') : (isDark ? '#60A5FA' : '#1D4ED8');

        dataset = {
            label: valCol,
            data: values,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            ...(type === 'bar' || type === 'horizontalBar' ? { borderRadius: 4 } : {})
        };
        
        if (!isPieOrDoughnut) {
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
    if (currentChart) {
        currentChart.rawData = data;
        currentChart.rawColumns = columns;
        currentChart.originalType = type;
    }
}

// Switcher logic
document.querySelectorAll('#chart-switcher button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(!window.lastChartData) return;
        const newType = e.target.getAttribute('data-type');
        renderChart(window.lastChartData, window.lastChartColumns, newType);
    });
});

/// --- Reports ---
let currentReportGroupVersions = [];
let currentReportId = null;

function setupReportsListeners() {
    const sel = document.getElementById('reports-project-select');
    sel.addEventListener('change', () => {
        loadReports(sel.value);
    });
    
    const searchInput = document.getElementById('report-search');
    if(searchInput) {
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.toLowerCase();
            document.querySelectorAll('.report-card-item').forEach(card => {
                const text = card.innerText.toLowerCase();
                card.style.display = text.includes(term) ? 'block' : 'none';
            });
        });
    }
}

async function loadReports(projectId) {
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    closeReportViewer();
    if (!projectId) return;
    
    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}/reports`);
        const data = await res.json();
        if (data.success && data.reports) {
            if (data.reports.length === 0) {
                list.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><h4>No Reports Found</h4><p>You haven\'t saved any reports for this project yet.</p></div>';
                return;
            }
            
            data.reports.forEach(r => {
                const card = document.createElement('div');
                card.className = 'card report-card-item';
                card.style.padding = '20px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.innerHTML = `
                    <div style="flex-grow: 1;">
                        <div class="flex justify-between items-start mb-2">
                            <h4 style="margin: 0; font-size: 1.1rem; font-weight: 600;">${r.report_name}</h4>
                            <span class="badge" style="background: var(--primary-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">v${r.version}</span>
                        </div>
                        <p class="text-sm text-secondary mb-3">"${r.question}"</p>
                        <div class="text-xs text-secondary mb-4 flex gap-2">
                            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 17v-4"/><path d="M12 17V9"/><path d="M17 17v-7"/></svg>${r.chart_type}</span>
                            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>${new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-primary flex-grow" onclick="viewReport('${r.id}', '${r.group_id}')">View Report</button>
                        <button class="btn btn-secondary" title="Delete" onclick="deleteHistory('${r.id}', 'report')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch (e) {
        list.innerHTML = '<div class="section-card" style="grid-column: 1/-1; text-align: center; padding: var(--spacing-4);"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" style="margin: 0 auto 1rem auto;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><h4>Error Loading Reports</h4><p>We encountered an issue fetching your reports. Please try again.</p></div>';
    }
}

function closeReportViewer() {
    document.getElementById('report-viewer-view').style.display = 'none';
    document.getElementById('reports-list-view').style.display = 'block';
    currentReportId = null;
    currentReportGroupVersions = [];
}

async function viewReport(reportId, groupId) {
    document.getElementById('reports-list-view').style.display = 'none';
    document.getElementById('report-viewer-view').style.display = 'block';
    
    currentReportId = reportId;
    
    try {
        const res = await fetch(`${API_BASE}/reports/${reportId}`);
        const rep = await res.json();
        
        // Populate Header
        document.getElementById('rv-title').textContent = rep.report_name;
        document.getElementById('rv-meta').textContent = `Version ${rep.version} | Created: ${new Date(rep.created_at).toLocaleString()}`;
        document.getElementById('rv-question').textContent = rep.question;
        document.getElementById('rv-sql').textContent = rep.generated_sql;
        
        // KPIs
        const kpiGrid = document.getElementById('rv-kpi-grid');
        kpiGrid.innerHTML = '';
        if (rep.kpis && rep.kpis.length > 0) {
            rep.kpis.forEach(kpi => {
                const c = document.createElement('div');
                c.className = 'kpi-card';
                c.innerHTML = `<div class="kpi-title">${kpi.title}</div><div class="kpi-value">${kpi.value}</div>`;
                kpiGrid.appendChild(c);
            });
        }
        
        // Chart
        document.getElementById('rv-chart-type-badge').textContent = rep.chart_type.charAt(0).toUpperCase() + rep.chart_type.slice(1);
        renderReportChart(rep.result_data, rep.chart_config, rep.chart_type);
        
        // Insights
        const insList = document.getElementById('rv-insights');
        insList.innerHTML = '';
        if (rep.insights && rep.insights > 0) {
            rep.insights.forEach(ins => {
                const li = document.createElement('li');
                li.style.marginBottom = '0.5rem';
                li.innerHTML = `<strong>${ins.title}</strong>: ${ins.description}`;
                insList.appendChild(li);
            });
        } else {
            insList.innerHTML = '<li class="text-secondary">No key insights generated.</li>';
        }
        
        // Table
        const thead = document.getElementById('rv-table-head');
        const tbody = document.getElementById('rv-table-body');
        thead.innerHTML = '';
        tbody.innerHTML = '';
        
        if (rep.result_data && rep.result_data.length > 0 && rep.chart_config) {
            let trHead = '<tr>';
            rep.chart_config.forEach(c => trHead += `<th>${c}</th>`);
            trHead += '</tr>';
            thead.innerHTML = trHead;
            
            rep.result_data.forEach(row => {
                let tr = '<tr>';
                rep.chart_config.forEach(c => tr += `<td>${row[c] !== null ? row[c] : ''}</td>`);
                tr += '</tr>';
                tbody.innerHTML += tr;
            });
        } else {
            tbody.innerHTML = '<tr><td class="text-secondary">No data available.</td></tr>';
        }
        
    } catch (e) {
        console.error(e);
        showToast('Failed to load report view.');
    }
}

// Read-only chart renderer for Report Viewer
let currentRvChart = null;
function renderReportChart(data, columns, type) {
    const ctx = document.getElementById('rv-chart');
    const container = document.getElementById('rv-chart-container');
    const card = document.getElementById('rv-chart-card');
    
    if (currentRvChart) { currentRvChart.destroy(); currentRvChart = null; }
    
    if (!data || data.length === 0 || !type || type === 'kpi' || type === 'table_only') {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    
    if (type === 'table') {
        container.style.display = 'none';
        return;
    } else {
        container.style.display = 'block';
    }
    
    const isDark = true;
    const textColor = '#F8FAFC';
    const gridColor = 'rgba(255, 255, 255, 0.1)';
    
    let chartOptions = { responsive: true, maintainAspectRatio: false, color: textColor, plugins: { legend: { labels: { color: textColor } } } };
    let dataset = {};
    let labels = [];
    
    if (type === 'scatter') {
        let xCol = columns[0];
        let yCol = columns.length > 1 ? columns[1] : columns[0];
        let isXNumeric = data.length > 0 && typeof data[0][xCol] === 'number';
        let scatterData = data.map(row => ({x: row[xCol], y: row[yCol]}));
        dataset = { label: `${yCol} vs ${xCol}`, data: scatterData, backgroundColor: isDark ? '#60A5FA' : '#3B82F6' };
        chartOptions.scales = {
            x: { type: isXNumeric ? 'linear' : 'category', position: 'bottom', title: { display: true, text: xCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
            y: { type: 'linear', title: { display: true, text: yCol, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
        };
    } else {
        let labelCol = columns[0];
        let valCol = columns.length > 1 ? columns[1] : columns[0];
        let values = [];
        data.forEach(row => { labels.push(row[labelCol] || 'Unknown'); values.push(row[valCol] || 0); });
        
        const bgColors = type === 'pie' ? ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'] : (isDark ? '#3B82F6' : '#2563EB');
        dataset = { label: valCol, data: values, backgroundColor: bgColors, borderWidth: 1 };
        
        if (type !== 'pie') {
            chartOptions.scales = {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            };
        }
    }
    
    let actualType = type === 'horizontalBar' ? 'bar' : type;
    if (type === 'horizontalBar') chartOptions.indexAxis = 'y';

    try {
        currentRvChart = new Chart(ctx, { type: actualType, data: { labels: labels, datasets: [dataset] }, options: chartOptions });
    } catch (e) { console.error("RV Chart rendering error:", e); }
}

async function reanalyzeCurrentReport() {
    if(!currentReportId) return;
    document.body.style.cursor = 'wait';
    try {
        const res = await fetch(`${API_BASE}/reports/${currentReportId}/reanalyze`, { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            showToast(`Report re-analyzed! New Version ${data.version} created.`);
            viewReport(data.report_id, null);
        } else {
            showToast('Failed to reanalyze: ' + (data.detail || 'Unknown error'));
        }
    } catch(e) {
        showToast('Error reanalyzing report.');
    } finally {
        document.body.style.cursor = 'default';
    }
}

// Temporary exports for V1 (Browser-based)
function exportReportCSV() {
    if(!currentReportId) return;
    const table = document.getElementById('rv-data-table');
    let csv = [];
    for (let i = 0; i < table.rows.length; i++) {
        let row = [], cols = table.rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) 
            row.push('"' + cols[j].innerText.replace(/"/g, '"') + '"');
        csv.push(row.join(","));
    }
    downloadFile(csv.join("\n"), 'report_data.csv', 'text/csv');
}

function exportReportPDF() {
    showToast("Export PDF is currently simulated in V1. You can use your browser's Print to PDF function (Ctrl+P) on this view.");
    window.print();
}

function downloadFile(content, filename, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = filename;
    a.click();
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
        if(!currentHistoryId) return showToast('No active report to save. Please run a query first.');
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
    sel.innerHTML = '<option value=">Select a Dashboard...</option>';
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
            showToast('Successfully added to dashboard!');
        }
    } catch(e) {
        showToast('Failed to add to dashboard.');
    }
}

async function openDashboard(dashboardId, dashboardName) {
    document.getElementById('dashboards-list').style.display = 'none';
    const container = document.getElementById('dashboard-widgets-container');
    container.style.display = 'block';
    document.getElementById('current-dashboard-name').textContent = dashboardName;
    
    const grid = document.getElementById('dashboard-widgets-grid');
    grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
    
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

async function deleteProjectFrontend(projectId) {
    if(!confirm('Are you sure you want to delete this project? All associated datasets and history will be lost.')) return;
    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            loadProjects();
            populateProjectSelects();
        } else {
            showToast('Failed to delete project.');
        }
    } catch(e) {
        showToast('Error deleting project.');
    }
}

async function deleteHistory(id, type) {
    if(!confirm('Are you sure you want to delete this item?')) return;
    try {
        let endpoint = `${API_BASE}/history/${id}`;
        if (type === 'report') endpoint = `${API_BASE}/reports/${id}`;
        
        const res = await fetch(endpoint, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            if(type === 'recent') loadRecentQueries();
            if(type === 'report') {
                const sel = document.getElementById('reports-project-select');
                loadReports(sel.value);
            }
        } else {
            showToast('Failed to delete item.');
        }
    } catch(e) {
        showToast('Error deleting item.');
    }
}

// ==========================================
// V10.2 Professional SQL Analytics Workbench
// ==========================================

let currentSqlData = [];
let currentSqlColumns = [];
let currentSqlChartInst = null;
let sqlEditorInstance = null;

function setupHorizontalResizers() {
    const schemaPanel = document.getElementById('schema-explorer-panel');
    const assistantPanel = document.getElementById('sql-assistant-panel');
    const resizerSchema = document.getElementById('resizer-schema');
    const resizerAssistant = document.getElementById('resizer-assistant');
    
    if (!schemaPanel || !assistantPanel) return;

    // Restore widths from localStorage if available
    const savedSchemaWidth = localStorage.getItem('sql_schema_width');
    const savedAssistantWidth = localStorage.getItem('sql_assistant_width');
    if (savedSchemaWidth) schemaPanel.style.width = savedSchemaWidth;
    if (savedAssistantWidth) assistantPanel.style.width = savedAssistantWidth;

    if (resizerSchema) {
        let isResizingSchema = false;
        resizerSchema.addEventListener('mousedown', (e) => {
            isResizingSchema = true;
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!isResizingSchema) return;
            // Prevent getting too small or too large
            let newWidth = e.clientX - schemaPanel.getBoundingClientRect().left;
            if (newWidth < 150) newWidth = 150;
            if (newWidth > 600) newWidth = 600;
            schemaPanel.style.width = `${newWidth}px`;
        });
        window.addEventListener('mouseup', () => {
            if (isResizingSchema) {
                isResizingSchema = false;
                document.body.style.cursor = 'default';
                localStorage.setItem('sql_schema_width', schemaPanel.style.width);
                if (sqlEditorInstance) sqlEditorInstance.layout();
            }
        });
    }

    if (resizerAssistant) {
        let isResizingAssistant = false;
        resizerAssistant.addEventListener('mousedown', (e) => {
            isResizingAssistant = true;
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!isResizingAssistant) return;
            const containerRight = document.body.getBoundingClientRect().right;
            let newWidth = containerRight - e.clientX;
            if (newWidth < 150) newWidth = 150;
            if (newWidth > 600) newWidth = 600;
            assistantPanel.style.width = `${newWidth}px`;
        });
        window.addEventListener('mouseup', () => {
            if (isResizingAssistant) {
                isResizingAssistant = false;
                document.body.style.cursor = 'default';
                localStorage.setItem('sql_assistant_width', assistantPanel.style.width);
                if (sqlEditorInstance) sqlEditorInstance.layout();
            }
        });
    }
}

// Initialize Monaco Editor
function initMonaco() {
    if (window.require && !sqlEditorInstance) {
        // Fix for Cloudflare/CDN CORS issues with Monaco Web Workers
        window.MonacoEnvironment = {
            getWorkerUrl: function(workerId, label) {
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                    self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.38.0/min/' };
                    importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.38.0/min/vs/base/worker/workerMain.js');
                `)}`;
            }
        };
        
        // Configure require.js dynamically in case Cloudflare Rocket Loader delayed the initial config
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.38.0/min/vs' }});
        
        require(['vs/editor/editor.main'], function() {
            sqlEditorInstance = monaco.editor.create(document.getElementById('sql-editor-container'), {
                value: "-- Write your SQL query here\nSELECT * FROM ...",
                language: 'sql',
                theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: true, renderCharacters: false },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 14,
                lineHeight: 24,
                padding: { top: 16 },
                folding: true,
                scrollBeyondLastLine: false,
                bracketPairColorization: { enabled: true },
                folding: true,
                lineNumbers: "on",
                suggestOnTriggerCharacters: true
            });
            
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(() => {
                    if (monaco.editor.remeasureFonts) {
                        monaco.editor.remeasureFonts();
                    }
                });
            }
        });
    }
}
// Wait for require.js to load, then init
let monacoLoaderInterval = setInterval(() => {
    if (window.require) {
        initMonaco();
        clearInterval(monacoLoaderInterval);
    }
}, 200);

function insertTextAtCursor(text) {
    if(!sqlEditorInstance) return;
    const position = sqlEditorInstance.getPosition();
    sqlEditorInstance.executeEdits("insert", [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: text + " "
    }]);
    sqlEditorInstance.focus();
}

// Populate SQL Project Select
document.getElementById('sql-project-select').addEventListener('change', (e) => {
    const pid = e.target.value;
    if (pid) {
        document.getElementById('sql-workspace').style.display = 'flex';
        loadSchemaForSqlEditor(pid);
        updateQueryAssistant(pid);
    } else {
        document.getElementById('sql-workspace').style.display = 'none';
    }
});

async function loadSchemaForSqlEditor(projectId) {
    try {
        const p = allProjectsCache.find(x => x.id === projectId);
        if (!p || !p.schema) return;
        
        let schemaHtml = '';
        const parsedSchema = (typeof p.schema === 'string') ? JSON.parse(p.schema) : p.schema;
        
        let tableCount = 0;
        let colCount = 0;

        for (const [table, cols] of Object.entries(parsedSchema)) {
            tableCount++;
            schemaHtml += `<div class="mb-2">
                <div class="schema-table-header" style="color: var(--text-primary); font-weight: 600; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0; transition: color 0.2s;" ondblclick="insertTextAtCursor('${table}')" title="Double-click to insert">
                    <span onclick="event.stopPropagation(); const next = this.parentElement.nextElementSibling; next.style.display = next.style.display === 'none' ? 'block' : 'none';" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-primary);"><path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M2 9h20"></path><path d="M9 2v20"></path></svg>
                    ${table}
                </div>
                <div style="padding-left: 2rem; font-size: 0.85rem; color: var(--text-secondary); display: none;">`;
            
            let colList = Array.isArray(cols) ? cols : Object.entries(cols).map(([name, type]) => ({name, type}));
            for (const colObj of colList) {
                const colName = colObj.name || colObj[0];
                const colType = colObj.type || colObj[1];
                const isPk = (colObj.is_pk || colName.toLowerCase() === 'id');
                const isFk = (colObj.is_fk || colName.toLowerCase().endsWith('_id'));
                
                colCount++;
                let icon = '';
                const typeLower = (colType || '').toLowerCase();
                
                if (isPk) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" style="margin-right:0.5rem;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
                else if (isFk) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" style="margin-right:0.5rem;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
                else if (typeLower.includes('int') || typeLower.includes('num') || typeLower.includes('real') || typeLower.includes('float') || typeLower.includes('double')) icon = `<span style="color: var(--accent-primary); font-family: var(--font-mono); font-size: 0.75rem; font-weight: bold; width: 16px; display: inline-block; text-align: center; margin-right: 0.5rem;">123</span>`;
                else if (typeLower.includes('date') || typeLower.includes('time')) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.5rem;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
                else icon = `<span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.7rem; font-weight: bold; width: 16px; display: inline-block; text-align: center; margin-right: 0.5rem;">ABC</span>`;
                
                schemaHtml += `<div class="schema-col-item py-1" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-radius: 4px; padding: 0.25rem 0.5rem; margin-left: -0.5rem; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'" onclick="insertTextAtCursor('${colName}')" title="Click to insert">
                    <div style="display: flex; align-items: center;">
                        ${icon}
                        <span style="color: var(--text-primary); font-family: var(--font-mono); font-size: 0.8rem;">${colName}</span> 
                    </div>
                    <span style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono);">${colType}</span>
                </div>`;
            }
            schemaHtml += `</div></div>`;
        }
        document.getElementById('schema-tree').innerHTML = schemaHtml;

        // Populate Summary Card
        const dName = document.getElementById('schema-dataset-name');
        if (dName) dName.textContent = p.name || 'Dataset';
        const tCount = document.getElementById('schema-table-count');
        if (tCount) tCount.textContent = tableCount;
        const cCount = document.getElementById('schema-col-count');
        if (cCount) cCount.textContent = colCount;
        const updated = document.getElementById('schema-last-updated');
        if (updated) updated.textContent = new Date().toLocaleDateString();
        
    } catch(e) {
        console.error("Failed to load schema for SQL Editor", e);
    }
}

async function updateQueryAssistant(projectId) {
    const overview = document.getElementById('assistant-overview-container');
    const fields = document.getElementById('assistant-fields-container');
    const templates = document.getElementById('assistant-templates-container');
    
    if (!overview || !fields || !templates) return;

    try {
        const p = allProjectsCache.find(x => x.id === projectId);
        if(!p) return;
        const schema = (typeof p.schema === 'string') ? JSON.parse(p.schema) : p.schema;
        
        let tablesCount = 0;
        let colsCount = 0;
        let metrics = [];
        let dimensions = [];

        for (const [table, cols] of Object.entries(schema)) {
            tablesCount++;
            let colList = Array.isArray(cols) ? cols : Object.entries(cols).map(([name, type]) => ({name, type}));
            for (const colObj of colList) {
                const colName = colObj.name || colObj[0];
                const colType = colObj.type || colObj[1];
                colsCount++;
                const typeLower = (colType || '').toLowerCase();
                if (typeLower.includes('int') || typeLower.includes('num') || typeLower.includes('real') || typeLower.includes('float') || typeLower.includes('double')) {
                    if (!metrics.includes(colName) && !colName.toLowerCase().includes('id')) metrics.push(colName);
                } else {
                    if (!dimensions.includes(colName)) dimensions.push(colName);
                }
            }
        }
        
        // Overview
        overview.innerHTML = `
            <h5 class="mb-3" style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Dataset Overview</h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
                <div style="background-color: var(--bg-hover); padding: 0.75rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">${tablesCount}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;">Tables</div>
                </div>
                <div style="background-color: var(--bg-hover); padding: 0.75rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">${colsCount}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;">Columns</div>
                </div>
            </div>
            <div style="background-color: var(--bg-hover); border-left: 2px solid var(--accent-primary); padding: 0.75rem 1rem; border-radius: 4px; font-size: 0.85rem; color: var(--text-secondary);">
                Click tables or columns in the Schema Explorer to insert them into the editor.
            </div>
        `;

        // Fields (Metrics / Dimensions)
        const metricTags = metrics.slice(0, 10).map(m => `<span style="display: inline-block; background-color: rgba(34, 197, 94, 0.1); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 12px; padding: 2px 8px; font-size: 0.75rem; margin: 0 4px 4px 0;"># ${m}</span>`).join('');
        const dimTags = dimensions.slice(0, 10).map(d => `<span style="display: inline-block; background-color: rgba(59, 130, 246, 0.1); color: var(--accent-primary); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 2px 8px; font-size: 0.75rem; margin: 0 4px 4px 0;">ABC ${d}</span>`).join('');
        
        fields.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <h5 class="mb-2" style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Key Metrics</h5>
                <div>${metricTags || '<span style="color: var(--text-muted); font-size: 0.8rem;">No metrics found.</span>'}</div>
            </div>
            <div>
                <h5 class="mb-2" style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Key Dimensions</h5>
                <div>${dimTags || '<span style="color: var(--text-muted); font-size: 0.8rem;">No dimensions found.</span>'}</div>
            </div>
        `;

        // Templates
        templates.innerHTML = `
            <h5 class="mb-3" style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Suggested Queries</h5>
            <div class="flex flex-col gap-2">
                <button class="btn text-left query-template-btn flex items-center gap-3" data-sql="SELECT * FROM table LIMIT 10" style="padding: 0.75rem; border-radius: 8px; border: none; background-color: var(--bg-hover); color: var(--text-primary); transition: opacity 0.2s; width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    Basic Select
                </button>
                <button class="btn text-left query-template-btn flex items-center gap-3" data-sql="SELECT category, COUNT(*) as count FROM table GROUP BY category ORDER BY count DESC" style="padding: 0.75rem; border-radius: 8px; border: none; background-color: var(--bg-hover); color: var(--text-primary); transition: opacity 0.2s; width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    Frequency Analysis
                </button>
                <button class="btn text-left query-template-btn flex items-center gap-3" data-sql="SELECT DATE_TRUNC('month', date_col) as month, SUM(amount) as total FROM table GROUP BY month ORDER BY month" style="padding: 0.75rem; border-radius: 8px; border: none; background-color: var(--bg-hover); color: var(--text-primary); transition: opacity 0.2s; width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    Monthly Trend
                </button>
                <button class="btn text-left query-template-btn flex items-center gap-3" data-sql="SELECT category, SUM(amount) as total FROM table GROUP BY category ORDER BY total DESC LIMIT 5" style="padding: 0.75rem; border-radius: 8px; border: none; background-color: var(--bg-hover); color: var(--text-primary); transition: opacity 0.2s; width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    Top 5 Categories
                </button>
            </div>
        `;

        // Re-bind template buttons
        document.querySelectorAll('.query-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sql = e.currentTarget.getAttribute('data-sql');
                if (sqlEditorInstance) {
                    sqlEditorInstance.setValue(sql);
                }
            });
        });

    } catch(e) {
        console.error("Failed to load assistant", e);
    }
}

// Search schema
document.getElementById('schema-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.schema-col-item, .schema-table-header');
    items.forEach(item => {
        if(item.textContent.toLowerCase().includes(term)) {
            item.style.display = 'block';
            if(item.classList.contains('schema-col-item')) {
                item.parentElement.style.display = 'block'; // expand parent
            }
        } else {
            item.style.display = 'none';
        }
    });
});

// Results Tabs Logic (Removed, scrolling UI)

// Template Click
document.querySelectorAll('.query-template-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(sqlEditorInstance) {
            sqlEditorInstance.setValue(e.target.dataset.sql);
        }
    });
});

// Toolbar Actions
var el = document.getElementById('btn-sql-format'); if(el) el.addEventListener('click', () => {
    if(sqlEditorInstance) sqlEditorInstance.getAction('editor.action.formatDocument').run();
});
var el = document.getElementById('btn-sql-clear'); if(el) el.addEventListener('click', () => {
    if(sqlEditorInstance) sqlEditorInstance.setValue('');
});
var el = document.getElementById('btn-sql-copy'); if(el) el.addEventListener('click', () => {
    if(sqlEditorInstance) navigator.clipboard.writeText(sqlEditorInstance.getValue());
    showToast("Copied to clipboard");
});
var el = document.getElementById('btn-sql-download'); if(el) el.addEventListener('click', () => {
    if(!sqlEditorInstance) return;
    const blob = new Blob([sqlEditorInstance.getValue()], { type: 'text/sql' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'query.sql';
    a.click();
});
var el = document.getElementById('btn-sql-export-csv'); if(el) el.addEventListener('click', () => {
    if(currentSqlData.length === 0) return showToast("No data to export");
    const ws = XLSX.utils.json_to_sheet(currentSqlData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "results.csv");
});
var el = document.getElementById('btn-sql-export-excel'); if(el) el.addEventListener('click', () => {
    if(currentSqlData.length === 0) return showToast("No data to export");
    const ws = XLSX.utils.json_to_sheet(currentSqlData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "results.xlsx");
});

var el = document.getElementById('btn-sql-view-more'); if(el) el.addEventListener('click', () => {
    window.currentSqlLimit += 50;
    renderSqlResults(true); // skip re-rendering chart
});

// Run SQL
var el = document.getElementById('btn-sql-run'); if(el) el.addEventListener('click', async () => {
    if(!sqlEditorInstance) return showToast("SQL Editor is not initialized.");
    const sql = sqlEditorInstance.getValue();
    const pid = document.getElementById('sql-project-select').value;
    const errOut = document.getElementById('sql-error-output');
    const expOut = document.getElementById('sql-explain-output');
    
    if(!pid) return showToast("Please select a project first.");
    if(!sql.trim()) return showToast("Please enter a SQL query to run.");
    
    errOut.style.display = 'none';
    expOut.style.display = 'none';
    const btn = document.getElementById('btn-sql-run');
    const originalRunHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg> Executing...`;
    btn.disabled = true;
    
    // Disable toolbar
    const btnFormat = document.getElementById('btn-sql-format');
    const btnSave = document.getElementById('btn-sql-save');
    if(btnFormat) btnFormat.disabled = true;
    if(btnSave) btnSave.disabled = true;
    
    const skeleton = document.getElementById('results-skeleton');
    const emptyState = document.getElementById('results-empty-state');
    const resultsWorkspace = document.getElementById('results-workspace');
    
    if(emptyState) emptyState.style.display = 'none';
    if(resultsWorkspace) resultsWorkspace.style.display = 'none';
    if(skeleton) skeleton.style.display = 'flex';
    
    try {
        const res = await fetch(`${API_BASE}/execute_sql`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({project_id: pid, sql: sql})
        });
        const data = await res.json();
        
        if (data.success) {
            currentSqlData = data.data;
            currentSqlColumns = data.columns;
            window.currentSqlLimit = 10; // Reset limit for new query
            
            // Toggle Empty State
            const emptyState = document.getElementById('results-empty-state');
            if(emptyState) emptyState.style.display = 'none';
            const resultsWorkspace = document.getElementById('results-workspace');
            if(resultsWorkspace) resultsWorkspace.style.display = 'flex';

            // KPI Bar
            document.getElementById('kpi-rows').textContent = data.row_count || currentSqlData.length;
            document.getElementById('kpi-cols').textContent = currentSqlColumns.length;
            document.getElementById('kpi-time').textContent = `${data.execution_time_ms || 0}ms`;
            
            // Auto-Charting Logic
            let autoChart = data.chart_type;
            if (!autoChart || autoChart === 'table') {
                if (currentSqlData.length > 0 && currentSqlData.length <= 100) {
                    const numCols = currentSqlColumns.filter(c => typeof (currentSqlData[0] ? currentSqlData[0][c] : undefined) === 'number');
                    const strCols = currentSqlColumns.filter(c => typeof (currentSqlData[0] ? currentSqlData[0][c] : undefined) === 'string');
                    
                    if (numCols.length > 0 && strCols.length > 0) {
                        const firstStr = strCols[0].toLowerCase();
                        if (firstStr.includes('date') || firstStr.includes('time') || firstStr.includes('month') || firstStr.includes('year')) {
                            autoChart = 'line';
                        } else if (currentSqlData.length <= 8) {
                            autoChart = 'doughnut';
                        } else {
                            autoChart = 'bar';
                        }
                    }
                }
            }
            autoChart = autoChart || 'table';
            
            const chartSel = document.getElementById('sql-chart-override');
            chartSel.value = autoChart;
            document.getElementById('kpi-chart').textContent = autoChart.toUpperCase();

            // Tab Counters
            const resCount = document.getElementById('tab-count-results');
            if(resCount) resCount.textContent = `(${currentSqlData.length})`;
            
            currentSortCol = null;
            currentSortAsc = true;
            renderSqlResults();
            generateLocalInsights();
            addToSessionHistory(sql, data);
            
            // Auto switch to results tab
            // Removed for scrolling UI
        } else {
            showErrorElement(errOut, data.error || 'Execution failed', 'Query Error');
            
        }
    } catch(e) {
        console.error("SQL Run Error:", e);
        showErrorElement(errOut, e.message, 'Query Error');
        
    } finally {
        if(skeleton) skeleton.style.display = 'none';
        btn.innerHTML = originalRunHtml;
        btn.disabled = false;
        const btnFormat = document.getElementById('btn-sql-format');
        const btnSave = document.getElementById('btn-sql-save');
        if(btnFormat) btnFormat.disabled = false;
        if(btnSave) btnSave.disabled = false;
    }
});

let currentSortCol = null;
let currentSortAsc = true;

window.sortSqlResults = function(col) {
    if(currentSortCol === col) {
        currentSortAsc = !currentSortAsc;
    } else {
        currentSortCol = col;
        currentSortAsc = true;
    }
    
    currentSqlData.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        
        if (valA === null) return currentSortAsc ? -1 : 1;
        if (valB === null) return currentSortAsc ? 1 : -1;
        
        if (typeof valA === 'string') {
            return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return currentSortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        }
    });
    
    renderSqlResults(true);
};

function renderSqlResults(skipChart = false) {
    const type = document.getElementById('sql-chart-override').value;
    const tCont = document.getElementById('tab-results');
    const cCont = document.getElementById('sql-chart-container');
    
    cCont.style.display = 'none';
    
    // Always render table in Results tab
    const thead = document.getElementById('sql-table-head');
    const tbody = document.getElementById('sql-table-body');
    
    thead.innerHTML = currentSqlColumns.map(c => {
        let arrow = '';
        if (currentSortCol === c) {
            arrow = currentSortAsc ? ' <span style="font-size: 0.7em;">Ã¢â€“Â²</span>' : ' <span style="font-size: 0.7em;">Ã¢â€“Â¼</span>';
        }
        return `<th onclick="sortSqlResults('${c}')" style="cursor: pointer; user-select: none;">${c}${arrow}</th>`;
    }).join('');
    
    window.currentSqlLimit = window.currentSqlLimit || 10;
    let displayData = currentSqlData.slice(0, window.currentSqlLimit);
    
    tbody.innerHTML = displayData.map(row => 
        `<tr>${currentSqlColumns.map(c => `<td>${row[c] !== null ? row[c] : '<i style="color: var(--text-muted);">null</i>'}</td>`).join('')}</tr>`
    ).join('');

    // Handle View More button
    const btnViewMore = document.getElementById('btn-sql-view-more');
    if (btnViewMore) {
        if (currentSqlData.length > window.currentSqlLimit) {
            btnViewMore.style.display = 'block';
            btnViewMore.textContent = `View More (Showing ${window.currentSqlLimit} of ${currentSqlData.length})`;
        } else {
            btnViewMore.style.display = 'none';
        }
    }

    // Handle Chart Tab
    if (type !== 'table' && !skipChart) {
        cCont.style.display = 'block';
        if(currentSqlChartInst) currentSqlChartInst.destroy();
        
        let labels = [];
        let values = [];
        if (currentSqlData.length > 0 && currentSqlColumns.length >= 2) {
            labels = currentSqlData.map(row => row[currentSqlColumns[0]]);
            values = currentSqlData.map(row => row[currentSqlColumns[1]]);
        }
        
        const ctx = document.getElementById('sql-canvas').getContext('2d');
        currentSqlChartInst = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: currentSqlColumns[1] || 'Metric',
                    data: values,
                    backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

document.getElementById('sql-chart-override').addEventListener('change', renderSqlResults);

function generateLocalInsights() {
    const cont = document.getElementById('sql-local-insights-content');
    if (currentSqlData.length === 0) {
        cont.innerHTML = '<p class="text-muted">No data available for insights.</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">';
    
    const numericCols = currentSqlColumns.filter(c => typeof currentSqlData[0][c] === 'number');
    
    html += `
        <div class="section-card" style="padding: 1.5rem; border-left: 4px solid var(--info);">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; color: var(--text-secondary);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Total Rows</span>
            </div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${currentSqlData.length.toLocaleString()}</div>
        </div>
    `;
    
    numericCols.forEach(col => {
        let sum = currentSqlData.reduce((acc, row) => acc + (row[col] || 0), 0);
        let max = Math.max(...currentSqlData.map(row => row[col] || 0));
        html += `
            <div class="section-card" style="padding: 1.5rem; border-left: 4px solid var(--success);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; color: var(--text-secondary);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    <span style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Sum of ${col}</span>
                </div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${sum.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
            </div>
            <div class="section-card" style="padding: 1.5rem; border-left: 4px solid var(--warning);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; color: var(--text-secondary);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    <span style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">Max ${col}</span>
                </div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${max.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
            </div>
        `;
    });
    
    html += '</div>';
    
    if(numericCols.length > 0 && currentSqlColumns.length > 1) {
        const catCol = currentSqlColumns.find(c => c !== numericCols[0]);
        if (catCol) {
            let sorted = [...currentSqlData].sort((a,b) => (b[numericCols[0]]||0) - (a[numericCols[0]]||0));
            let topVal = sorted[0][numericCols[0]] || 0;
            html += `<div class="section-card" style="padding: 1.5rem; border-left: 4px solid var(--accent-primary);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    <h5 style="margin: 0; color: var(--text-primary); font-size: 1rem;">Key Finding</h5>
                </div>
                <p style="margin: 0; color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem;">The top performing <strong>${catCol}</strong> by <strong>${numericCols[0]}</strong> is <strong>${sorted[0][catCol]}</strong> with a value of ${topVal.toLocaleString(undefined, {maximumFractionDigits: 2})}.</p>
            </div>`;
        }
    }
    
    cont.innerHTML = html;
}

let sessionHistory = [];
function addToSessionHistory(sql, resultData) {
    sessionHistory.unshift({
        sql: sql,
        time: new Date().toLocaleTimeString(),
        rows: resultData.row_count,
        exec: resultData.execution_time_ms,
        data: resultData.data,
        columns: resultData.columns,
        chart: resultData.chart_type
    });
    renderSessionHistory();
}

function renderSessionHistory() {
    const list = document.getElementById('sql-session-history-list');
    list.innerHTML = sessionHistory.map((h, i) => `
        <div class="list-item section-card" style="margin-bottom: 0.75rem; padding: 1.25rem; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;" onclick="loadHistoryItem(${i})" onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='var(--border-color)'; this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='none'; this.style.borderColor='transparent'; this.style.boxShadow='var(--shadow-sm)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    ${h.time}
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <span style="font-size: 0.75rem; background: var(--bg-hover); padding: 0.2rem 0.5rem; border-radius: 12px; color: var(--text-primary); font-weight: 500;">${h.rows} rows</span>
                    <span style="font-size: 0.75rem; background: var(--bg-hover); padding: 0.2rem 0.5rem; border-radius: 12px; color: var(--text-primary); font-weight: 500;">${h.exec}ms</span>
                </div>
            </div>
            <div style="font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); font-size: 0.85rem; background: var(--bg-hover); padding: 0.75rem; border-radius: var(--radius-btn); border: 1px solid var(--border-color);">
                ${h.sql}
            </div>
        </div>
    `).join('');
    
    const countEl = document.getElementById('tab-count-history');
    if(countEl) countEl.textContent = `(${sessionHistory.length})`;
}

window.loadHistoryItem = function(index) {
    const h = sessionHistory[index];
    if(sqlEditorInstance) sqlEditorInstance.setValue(h.sql);
    currentSqlData = h.data;
    currentSqlColumns = h.columns;
    window.currentSqlLimit = 10;
    document.getElementById('sql-chart-override').value = h.chart || 'table';
    document.getElementById('sql-res-time').textContent = `${h.exec}ms (cached)`;
    document.getElementById('sql-res-rows').textContent = `${h.rows} rows`;
    renderSqlResults();
    generateLocalInsights();
    // document.querySelector('.results-tab-btn[data-tab="results"]').click();
};

// Explain SQL
document.getElementById('btn-sql-explain').addEventListener('click', async () => {
    if(!sqlEditorInstance) return;
    const sql = sqlEditorInstance.getValue();
    const pid = document.getElementById('sql-project-select').value;
    if(!sql || !pid) return;
    
    const expOut = document.getElementById('sql-explain-output');
    expOut.style.display = 'block';
    expOut.innerHTML = '<i>Generating explanation...</i>';
    
    try {
        const res = await fetch(`${API_BASE}/projects/${pid}/sql/explain`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({sql: sql})
        });
        const data = await res.json();
        if (data.success) {
            expOut.innerHTML = `<strong>Explanation:</strong> ${data.explanation}`;
        } else {
            expOut.innerHTML = `Failed to generate explanation.`;
        }
    } catch(e) {
        expOut.innerHTML = 'Error communicating with explain endpoint.';
    }
});

// Save Query Flow
document.getElementById('btn-sql-save').addEventListener('click', () => {
    if(!sqlEditorInstance || !sqlEditorInstance.getValue()) return;
    document.getElementById('save-query-modal').style.display = 'flex';
});

document.getElementById('btn-save-query-cancel').addEventListener('click', () => {
    document.getElementById('save-query-modal').style.display = 'none';
});

document.getElementById('btn-save-query-confirm').addEventListener('click', async () => {
    const name = document.getElementById('save-query-name').value;
    const sql = sqlEditorInstance.getValue();
    const pid = document.getElementById('sql-project-select').value;
    const chartType = document.getElementById('sql-chart-override').value;
    
    if(!name) {
        showToast("Please provide a name.");
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/projects/${pid}/sql/save`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, sql, chart_type: chartType})
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('save-query-modal').style.display = 'none';
            showToast("Query saved successfully.");
        }
    } catch(e) {
        showToast("Failed to save query.");
    }
});

// Query Library Flow
document.getElementById('btn-sql-library').addEventListener('click', async () => {
    const pid = document.getElementById('sql-project-select').value;
    if(!pid) {
        showToast("Select a project first.");
        return;
    }
    document.getElementById('query-library-modal').style.display = 'flex';
    const list = document.getElementById('query-library-list');
    list.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
    
    try {
        const res = await fetch(`${API_BASE}/projects/${pid}/sql/saved`);
        const data = await res.json();
        if (data.success) {
            if(data.queries.length === 0) {
                list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg><h4>No Saved Queries</h4><p>Queries you save will appear here.</p></div>';
            } else {
                list.innerHTML = data.queries.map(q => `
                    <div class="card mb-2 p-4 flex justify-between items-center" style="background: var(--bg-secondary);">
                        <div>
                            <h4 style="margin: 0; color: var(--text-primary);">${q.name}</h4>
                            <div class="text-sm mt-1" style="color: var(--text-secondary); max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${q.sql}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-primary" onclick="loadSavedQueryIntoEditor(\`${btoa(q.sql)}\`, '${q.chart_type}')">Load</button>
                            <button class="btn btn-secondary" onclick="deleteSavedQuery('${q.id}', '${pid}')">Delete</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        list.innerHTML = 'Failed to load library.';
    }
});

document.getElementById('btn-close-query-library').addEventListener('click', () => {
    document.getElementById('query-library-modal').style.display = 'none';
});

window.loadSavedQueryIntoEditor = function(b64Sql, chartType) {
    const sql = atob(b64Sql);
    if(sqlEditorInstance) sqlEditorInstance.setValue(sql);
    document.getElementById('sql-chart-override').value = chartType || 'table';
    document.getElementById('query-library-modal').style.display = 'none';
};

window.deleteSavedQuery = async function(id, pid) {
    if(!confirm("Delete this saved query?")) return;
    await fetch(`${API_BASE}/sql/saved/${id}`, { method: 'DELETE' });
    document.getElementById('btn-sql-library').click(); // refresh list
};

// Save Report From SQL
document.getElementById('btn-sql-save-report').addEventListener('click', () => {
    if(currentSqlData.length === 0) {
        showToast("Run a query to generate results before saving a report.", "error");
        return;
    }
    document.getElementById('save-sql-report-modal').style.display = 'flex';
});

document.getElementById('btn-save-sql-report-cancel').addEventListener('click', () => {
    document.getElementById('save-sql-report-modal').style.display = 'none';
});

document.getElementById('btn-save-sql-report-confirm').addEventListener('click', async () => {
    const name = document.getElementById('save-sql-report-name').value;
    const pid = document.getElementById('sql-project-select').value;
    const sql = sqlEditorInstance ? sqlEditorInstance.getValue() : '';
    const chartType = document.getElementById('sql-chart-override').value;
    
    if(!name) {
        showToast("Please enter a report name.", "error");
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/reports/from_sql`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                project_id: pid,
                report_name: name,
                sql: sql,
                chart_type: chartType,
                data: currentSqlData,
                columns: currentSqlColumns
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Report saved! You can view it in the Reports tab.", "success");
            document.getElementById('save-sql-report-modal').style.display = 'none';
        } else {
            showToast("Failed to save report.", "error");
        }
    } catch (e) {
        showToast("Network error.");
    }
});
// Enterprise UI/UX V1: Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.style.background = 'var(--bg-card)';
    toast.style.color = 'var(--text-primary)';
    toast.style.border = '1px solid var(--border-color)';
    toast.style.borderLeft = '4px solid var(--' + type + ')';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = 'var(--shadow-md)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>';
    } else if (type === 'danger' || type === 'error') {
        iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
        iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = iconSvg + '<span>' + message + '</span>';
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Error card helper
function showErrorElement(el, message, title = 'Error') {
    el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
                   '<div><div style="font-weight: 600; margin-bottom: 4px;">' + title + '</div><div style="font-size: 14px; color: var(--text-secondary);">' + message + '</div></div>';
    el.style.display = 'flex';
}
