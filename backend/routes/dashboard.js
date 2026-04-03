import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  const apiBase = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(getDashboardHtml(apiBase));
});

function getDashboardHtml(apiBase) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --fg: #c9d1d9;
      --border: #30363d;
      --input-bg: #161b22;
      --input-fg: #c9d1d9;
      --btn-bg: #238636;
      --btn-fg: #ffffff;
      --btn-hover: #2ea043;
      --btn-sec-bg: #21262d;
      --btn-sec-fg: #c9d1d9;
      --focus: #58a6ff;
      --quote-bg: #161b22;
      --hover-bg: #161b22;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --card-bg: #161b22;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font); padding: 24px; color: var(--fg); background: var(--bg); line-height: 1.5; max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.6em; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    h1::before { content: '🤖'; }
    .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
    .tab { padding: 10px 18px; cursor: pointer; border: none; background: transparent; color: var(--fg); font-size: 13px; opacity: 0.6; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab:hover { opacity: 1; background: var(--hover-bg); }
    .tab.active { opacity: 1; border-bottom-color: var(--focus); color: var(--focus); }
    .panel { display: none; }
    .panel.active { display: block; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 1.1em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    input, select, button, textarea { font-family: inherit; font-size: 13px; padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--input-bg); color: var(--input-fg); transition: border-color 0.2s; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--focus); }
    button { background: var(--btn-bg); color: var(--btn-fg); border: none; cursor: pointer; white-space: nowrap; font-weight: 500; }
    button:hover { background: var(--btn-hover); }
    button.secondary { background: var(--btn-sec-bg); color: var(--btn-sec-fg); }
    button.secondary:hover { border-color: var(--focus); }
    input, textarea { width: 100%; }
    select { min-width: 140px; }
    pre { background: var(--quote-bg); padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; margin-top: 10px; border: 1px solid var(--border); }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge.ok, .badge.completed { background: #2ea04333; color: #3fb950; }
    .badge.healthy { background: #2ea04333; color: #3fb950; }
    .badge.error, .badge.failed { background: #f8514933; color: #f85149; }
    .badge.pending, .badge.planning { background: #848d9733; color: #8b949e; }
    .badge.executing { background: #a371f733; color: #bc8cff; }
    .badge.degraded { background: #d2992233; color: #d29922; }
    .task-list { list-style: none; }
    .task-item { padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
    .task-item:hover { background: var(--hover-bg); border-color: var(--focus); }
    .task-meta { font-size: 11px; opacity: 0.6; }
    .loader { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--fg); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty { opacity: 0.5; font-style: italic; padding: 14px; }
    .connection-status { font-size: 12px; margin-left: auto; }
    .health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .health-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
    .health-card h3 { font-size: 13px; text-transform: capitalize; margin-bottom: 6px; }
  </style>
</head>
<body>
  <h1>
    AI Dashboard
    <span class="connection-status" id="connectionStatus">
      <span class="badge pending">Connecting...</span>
    </span>
  </h1>

  <div class="tabs">
    <button class="tab active" data-panel="agents" data-testid="tab-agents">Agents</button>
    <button class="tab" data-panel="search" data-testid="tab-search">Search</button>
    <button class="tab" data-panel="browse" data-testid="tab-browse">Browse</button>
    <button class="tab" data-panel="memory" data-testid="tab-memory">Memory</button>
    <button class="tab" data-panel="system" data-testid="tab-system">System</button>
  </div>

  <!-- Agents Panel -->
  <div id="agents" class="panel active" data-testid="panel-agents">
    <div class="section">
      <h2>Run Agent</h2>
      <div class="row">
        <select id="agentType" data-testid="agent-type">
          <option value="research">Research</option>
          <option value="monitor">Monitor</option>
          <option value="automation">Automation</option>
          <option value="memory">Memory</option>
        </select>
        <input id="agentInput" placeholder="Task description..." style="flex:1" data-testid="agent-input" />
        <button id="agentBtn" data-testid="agent-run-btn">Run</button>
      </div>
      <pre id="agentResult" style="display:none" data-testid="agent-result"></pre>
    </div>
    <div class="section">
      <h2>Recent Tasks <button class="secondary" id="refreshTasks" style="font-size:11px;padding:4px 10px;margin-left:8px;" data-testid="refresh-tasks-btn">Refresh</button></h2>
      <ul class="task-list" id="taskList" data-testid="task-list"><li class="empty">Click Refresh to load tasks</li></ul>
    </div>
    <pre id="taskDetail" style="display:none" data-testid="task-detail"></pre>
  </div>

  <!-- Search Panel -->
  <div id="search" class="panel" data-testid="panel-search">
    <div class="section">
      <h2>Web Search</h2>
      <div class="row">
        <input id="searchInput" placeholder="Search query..." style="flex:1" data-testid="search-input" />
        <button id="searchBtn" data-testid="search-btn">Search</button>
      </div>
      <pre id="searchResult" style="display:none" data-testid="search-result"></pre>
    </div>
  </div>

  <!-- Browse Panel -->
  <div id="browse" class="panel" data-testid="panel-browse">
    <div class="section">
      <h2>Browse URL</h2>
      <div class="row">
        <input id="browseInput" placeholder="https://example.com" style="flex:1" data-testid="browse-input" />
        <button id="browseBtn" data-testid="browse-btn">Browse</button>
      </div>
      <pre id="browseResult" style="display:none" data-testid="browse-result"></pre>
    </div>
  </div>

  <!-- Memory Panel -->
  <div id="memory" class="panel" data-testid="panel-memory">
    <div class="section">
      <h2>Search Memory</h2>
      <div class="row">
        <input id="memoryInput" placeholder="Search stored memories..." style="flex:1" data-testid="memory-input" />
        <button id="memoryBtn" data-testid="memory-btn">Search</button>
      </div>
      <pre id="memoryResult" style="display:none" data-testid="memory-result"></pre>
    </div>
  </div>

  <!-- System Panel -->
  <div id="system" class="panel" data-testid="panel-system">
    <div class="section">
      <h2>Health Check</h2>
      <button id="healthBtn" data-testid="health-btn">Check Health</button>
      <div id="healthResult" style="margin-top:12px" data-testid="health-result"></div>
    </div>
  </div>

  <script>
    const API_BASE = '${apiBase}';

    async function apiFetch(path, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(API_BASE + path, {
          headers,
          signal: controller.signal,
          ...options,
        });
        clearTimeout(timeout);
        return res.json();
      } catch (err) {
        return { success: false, error: err.name === 'AbortError' ? 'Request timed out' : err.message };
      }
    }

    // Connection check
    async function checkConnection() {
      const el = document.getElementById('connectionStatus');
      try {
        const data = await apiFetch('/health');
        if (data.data && data.data.checks) {
          el.innerHTML = data.data.status === 'healthy'
            ? '<span class="badge ok">Connected</span>'
            : '<span class="badge degraded">Degraded</span>';
        } else {
          el.innerHTML = '<span class="badge degraded">Degraded</span>';
        }
      } catch {
        el.innerHTML = '<span class="badge error">Disconnected</span>';
      }
    }
    checkConnection();
    setInterval(checkConnection, 30000);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
      });
    });

    function showResult(el, data) {
      el.style.display = 'block';
      el.textContent = JSON.stringify(data, null, 2);
    }

    // Agents
    document.getElementById('agentBtn').addEventListener('click', async () => {
      const type = document.getElementById('agentType').value;
      const input = document.getElementById('agentInput').value.trim();
      if (!input) return;
      const el = document.getElementById('agentResult');
      el.style.display = 'block';
      el.innerHTML = '<span class="loader"></span> Running...';
      const data = await apiFetch('/agent/run', { method: 'POST', body: JSON.stringify({ type, input }) });
      showResult(el, data);
    });

    document.getElementById('refreshTasks').addEventListener('click', async () => {
      const data = await apiFetch('/agent/tasks?limit=20');
      renderTasks(data);
    });

    function renderTasks(data) {
      const list = document.getElementById('taskList');
      if (data.success && data.data && data.data.length) {
        list.innerHTML = data.data.map(t =>
          '<li class="task-item" data-id="' + t.id + '">'
          + '<div><span class="badge ' + t.status + '">' + t.status + '</span> '
          + '<strong>' + t.type + '</strong></div>'
          + '<span class="task-meta">' + new Date(t.created_at).toLocaleString() + '</span>'
          + '</li>'
        ).join('');
        list.querySelectorAll('.task-item').forEach(item => {
          item.addEventListener('click', async () => {
            const data = await apiFetch('/agent/status/' + item.dataset.id);
            showResult(document.getElementById('taskDetail'), data);
          });
        });
      } else {
        list.innerHTML = '<li class="empty">No tasks found</li>';
      }
    }

    // Search
    document.getElementById('searchBtn').addEventListener('click', async () => {
      const q = document.getElementById('searchInput').value.trim();
      if (!q) return;
      const el = document.getElementById('searchResult');
      el.style.display = 'block';
      el.innerHTML = '<span class="loader"></span> Searching...';
      const data = await apiFetch('/search', { method: 'POST', body: JSON.stringify({ query: q }) });
      if (data.success && data.data && data.data.results) {
        const items = data.data.results.map(r =>
          '\\u2022 ' + r.title + '\\n  ' + r.url + '\\n  ' + (r.snippet || '').slice(0, 120)
        ).join('\\n\\n');
        el.style.display = 'block';
        el.textContent = items || 'No results found';
      } else {
        showResult(el, data);
      }
    });

    // Browse
    document.getElementById('browseBtn').addEventListener('click', async () => {
      const url = document.getElementById('browseInput').value.trim();
      if (!url) return;
      const el = document.getElementById('browseResult');
      el.style.display = 'block';
      el.innerHTML = '<span class="loader"></span> Browsing...';
      const data = await apiFetch('/browse', { method: 'POST', body: JSON.stringify({ url }) });
      if (data.success && data.data && data.data.text) {
        el.style.display = 'block';
        el.textContent = data.data.text.slice(0, 10000);
      } else {
        showResult(el, data);
      }
    });

    // Memory
    document.getElementById('memoryBtn').addEventListener('click', async () => {
      const q = document.getElementById('memoryInput').value.trim();
      if (!q) return;
      const el = document.getElementById('memoryResult');
      el.style.display = 'block';
      el.innerHTML = '<span class="loader"></span> Searching memory...';
      const data = await apiFetch('/memory/search?q=' + encodeURIComponent(q));
      showResult(el, data);
    });

    // Health
    document.getElementById('healthBtn').addEventListener('click', async () => {
      const data = await apiFetch('/health');
      const el = document.getElementById('healthResult');
      if (data.data && data.data.checks) {
        let html = '<div class="health-grid">';
        Object.entries(data.data.checks).forEach(([k, v]) => {
          html += '<div class="health-card"><h3>' + k + '</h3><span class="badge ' + v + '">' + v + '</span></div>';
        });
        html += '</div>';
        html += '<p style="margin-top:12px"><span class="badge ' + data.data.status + '">'
          + data.data.status + '</span> <span class="task-meta">Uptime: ' + Math.round(data.data.uptime) + 's</span></p>';
        el.innerHTML = html;
      } else {
        el.innerHTML = '<span class="badge error">Error</span> ' + (data.error || '');
      }
    });

    // Auto-load tasks
    setTimeout(() => document.getElementById('refreshTasks').click(), 1000);
  </script>
</body>
</html>`;
}

export default router;
