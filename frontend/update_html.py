import sys

with open('c:/Users/anujp/OneDrive/Desktop/Analytics tool/frontend/app.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_tag = '<!-- SQL Editor View -->'
end_tag = '<!-- Query Library Modal -->'

start_idx = content.find(start_tag)
end_idx = content.find(end_tag)

if start_idx == -1 or end_idx == -1:
    print('Tags not found!')
    sys.exit(1)

new_html = """<!-- SQL Editor View -->
            <div id="view-sql" class="view" style="background-color: var(--bg-hover); flex-direction: column; min-height: 100%;">
                <div class="px-8 py-5 flex justify-between items-start">
                    <div>
                        <h2 style="margin: 0 0 0.25rem 0; font-size: 1.75rem; font-weight: 700;">SQL Analytics Workbench</h2>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">Run SQL queries, visualize results, generate insights, and save reports.</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <select id="sql-project-select" class="form-select" style="max-width: 250px; border-radius: var(--radius-btn);">
                            <option value="">Select a Dataset...</option>
                        </select>
                        <button class="btn btn-secondary flex items-center gap-2" style="white-space: nowrap; height: 38px; justify-content: center; padding: 0 1rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                            Saved Queries
                        </button>
                        <button id="btn-sql-library" class="btn btn-secondary flex items-center gap-2" style="white-space: nowrap; height: 38px; justify-content: center; padding: 0 1rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            Query Library
                        </button>
                        <button class="btn btn-secondary flex items-center gap-2" style="white-space: nowrap; height: 38px; justify-content: center; padding: 0 1rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Export
                        </button>
                    </div>
                </div>

                <div class="sql-workspace flex" style="flex: 1; display: none; background-color: transparent; padding: 1rem 2rem 2rem 2rem; gap: 0; align-items: flex-start;" id="sql-workspace">
                    <!-- Left Sidebar: Schema Explorer -->
                    <div class="schema-explorer section-card" id="schema-explorer-panel" style="width: 20%; flex-shrink: 0; display: flex; flex-direction: column; position: sticky; top: 80px; max-height: calc(100vh - 120px);">
                        <!-- Dataset Summary Card -->
                        <div class="p-4" style="border-bottom: 1px solid var(--border-color); background-color: var(--bg-hover);">
                            <h5 style="color: var(--text-primary); font-size: 0.875rem; margin-bottom: 0.5rem; font-weight: 600;" id="schema-dataset-name">Select a Dataset</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">
                                <div><strong id="schema-table-count">0</strong> Tables</div>
                                <div><strong id="schema-col-count">0</strong> Columns</div>
                                <div style="grid-column: span 2;">Updated: <span id="schema-last-updated">N/A</span></div>
                            </div>
                        </div>
                        <div class="p-4" style="border-bottom: 1px solid var(--border-color);">
                            <input type="text" id="schema-search" class="form-input" style="font-size: 0.85rem;" placeholder="Search tables or columns...">
                        </div>
                        <div id="schema-tree" class="p-4" style="flex: 1; overflow-y: auto;"></div>
                    </div>

                    <div class="resizer-v" id="resizer-schema"></div>

                    <!-- Center Panel: SQL Editor & Results -->
                    <div class="sql-center-panel" id="sql-editor-panel" style="flex: 1; min-width: 300px; display: flex; flex-direction: column; background-color: transparent;">
                        
                        <div class="section-card" style="display: flex; flex-direction: column; margin-bottom: 2rem;">
                            <!-- Editor Toolbar -->
                            <div class="editor-toolbar flex justify-between items-center px-4 py-3" style="border-bottom: 1px solid var(--border-color); background-color: transparent;">
                                <div class="flex gap-2">
                                    <button id="btn-sql-run" class="btn btn-primary flex items-center gap-2" style="padding: 0.35rem 1rem;">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        Run Query
                                    </button>
                                    <button id="btn-sql-format" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                        Format SQL
                                    </button>
                                    <button id="btn-sql-save" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                        Save Query
                                    </button>
                                </div>
                                <div class="flex gap-1">
                                    <button id="btn-sql-explain" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 4 4 4 4 8a6 6 0 1 1-12 0c0-4 4-4 4-8a2 2 0 0 1 2-2z"></path></svg>
                                        Explain SQL
                                    </button>
                                    <button id="btn-sql-copy" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        Copy
                                    </button>
                                    <button id="btn-sql-download" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                        Download SQL
                                    </button>
                                    <button id="btn-sql-clear" class="btn flex items-center gap-2" style="padding: 0.35rem 0.75rem; color: var(--text-secondary);">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <!-- Monaco Editor Container -->
                            <div id="sql-editor-container" style="height: 500px;"></div>
                        </div>

                        <div id="sql-error-output" class="status-error status-message mb-4" style="display: none; border-radius: 8px;"></div>
                        <div id="sql-explain-output" class="status-message mb-4 section-card" style="display: none; padding: 1.5rem;"></div>

                        <!-- Results Workspace (Stacked) -->
                        <div id="results-workspace" style="display: none; flex-direction: column; gap: 2rem;">
                            <!-- Query Statistics (KPI Bar) -->
                            <div class="kpi-summary-bar flex items-center gap-8 px-6 py-4 section-card" style="font-size: 0.85rem;">
                                <div class="flex flex-col"><span style="color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">Rows</span><strong id="kpi-rows" style="color: var(--text-primary); font-size: 1.1rem;">0</strong></div>
                                <div class="flex flex-col"><span style="color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">Columns</span><strong id="kpi-cols" style="color: var(--text-primary); font-size: 1.1rem;">0</strong></div>
                                <div class="flex flex-col"><span style="color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">Runtime</span><strong id="kpi-time" style="color: var(--text-primary); font-size: 1.1rem;">0ms</strong></div>
                                <div class="flex flex-col"><span style="color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">Chart</span><strong id="kpi-chart" style="color: var(--text-primary); font-size: 1.1rem;">-</strong></div>
                            </div>

                            <!-- Tab: Results -->
                            <div id="tab-results" class="section-card" style="display: block;">
                                <div class="px-6 py-4 flex justify-between items-center" style="border-bottom: 1px solid var(--border-color);">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Results</h3>
                                    <div class="flex gap-2">
                                        <button id="btn-sql-export-csv" class="btn btn-secondary flex items-center gap-2" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> CSV</button>
                                    </div>
                                </div>
                                <div style="overflow-x: auto; padding: 1rem;">
                                    <table class="data-table" id="sql-data-table">
                                        <thead><tr id="sql-table-head"></tr></thead>
                                        <tbody id="sql-table-body"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Tab: Charts -->
                            <div id="tab-charts" class="section-card" style="display: block;">
                                <div class="px-6 py-4 flex justify-between items-center" style="border-bottom: 1px solid var(--border-color);">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Visualizations</h3>
                                    <div class="flex gap-2 items-center">
                                        <label class="text-sm text-secondary">Chart Type:</label>
                                        <select id="sql-chart-override" class="form-select" style="padding: 0.25rem 2rem 0.25rem 0.5rem;">
                                            <option value="table">Table (Auto)</option>
                                            <option value="bar">Bar Chart</option>
                                            <option value="line">Line Chart</option>
                                            <option value="pie">Pie Chart</option>
                                            <option value="doughnut">Donut Chart</option>
                                            <option value="scatter">Scatter Plot</option>
                                        </select>
                                        <button id="btn-sql-save-report" class="btn btn-primary ml-2" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">Save Report</button>
                                    </div>
                                </div>
                                <div id="sql-chart-container" style="padding: 1.5rem; min-height: 400px; display: block;">
                                    <canvas id="sql-canvas"></canvas>
                                </div>
                            </div>

                            <!-- Tab: Insights -->
                            <div id="tab-insights" class="section-card" style="display: block;">
                                <div class="px-6 py-4" style="border-bottom: 1px solid var(--border-color);">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Local Data Insights</h3>
                                </div>
                                <div id="sql-local-insights-content" class="p-6">
                                    <p class="text-sm" style="color: var(--text-secondary);">Run a query to generate local insights.</p>
                                </div>
                            </div>

                            <!-- Tab: History -->
                            <div id="tab-history" class="section-card" style="display: block;">
                                <div class="px-6 py-4" style="border-bottom: 1px solid var(--border-color);">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Session Query History</h3>
                                </div>
                                <div id="sql-session-history-list" class="item-list p-6"></div>
                            </div>
                        </div>

                        <!-- Empty State -->
                        <div id="results-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); padding: 6rem 2rem; text-align: center;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">No Query Executed Yet</h3>
                            <p style="margin: 0; font-size: 0.875rem;">Run a SQL query to generate Results, Charts, and Insights.</p>
                        </div>
                    </div>

                    <div class="resizer-v" id="resizer-assistant"></div>

                    <!-- Right Sidebar: Query Assistant -->
                    <div class="query-assistant section-card" id="sql-assistant-panel" style="width: 25%; padding: 1.5rem; flex-shrink: 0; display: flex; flex-direction: column; overflow-y: auto; position: sticky; top: 80px; max-height: calc(100vh - 120px);">
                        <h4 class="mb-6" style="font-weight: 600;">Analytics Assistant</h4>
                        
                        <div id="assistant-overview-container" class="mb-6"></div>
                        
                        <div id="assistant-fields-container" class="mb-6"></div>

                        <div id="assistant-templates-container" class="mb-6"></div>
                    </div>
                </div>
            </div>
            
            """

content = content[:start_idx] + new_html + content[end_idx:]

with open('c:/Users/anujp/OneDrive/Desktop/Analytics tool/frontend/app.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated app.html successfully.')
