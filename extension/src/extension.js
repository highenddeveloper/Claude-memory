const vscode = require('vscode');

function activate(context) {
  const config = () => vscode.workspace.getConfiguration('aiDashboard');

  async function backendFetch(path, options = {}) {
    const baseUrl = config().get('backendUrl') || 'http://localhost:3001';
    const apiKey = config().get('apiKey') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${baseUrl}${path}`, {
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

  // Open Dashboard webview
  context.subscriptions.push(
    vscode.commands.registerCommand('aiDashboard.open', () => {
      const panel = vscode.window.createWebviewPanel(
        'aiDashboard',
        'AI Dashboard',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.webview.html = getDashboardHtml();

      // Auto-refresh polling interval
      let pollInterval = null;

      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'runAgent') {
          const data = await backendFetch('/agent/run', {
            method: 'POST',
            body: JSON.stringify({ type: msg.type, input: msg.input }),
          });
          panel.webview.postMessage({ command: 'agentResult', data });
        } else if (msg.command === 'health') {
          const data = await backendFetch('/health');
          panel.webview.postMessage({ command: 'healthResult', data });
        } else if (msg.command === 'search') {
          const data = await backendFetch('/search', {
            method: 'POST',
            body: JSON.stringify({ query: msg.query }),
          });
          panel.webview.postMessage({ command: 'searchResult', data });
        } else if (msg.command === 'browse') {
          const data = await backendFetch('/browse', {
            method: 'POST',
            body: JSON.stringify({ url: msg.url }),
          });
          panel.webview.postMessage({ command: 'browseResult', data });
        } else if (msg.command === 'memorySearch') {
          const q = encodeURIComponent(msg.query);
          const data = await backendFetch(`/memory/search?q=${q}`);
          panel.webview.postMessage({ command: 'memoryResult', data });
        } else if (msg.command === 'listTasks') {
          const data = await backendFetch('/agent/tasks?limit=20');
          panel.webview.postMessage({ command: 'tasksResult', data });
        } else if (msg.command === 'taskStatus') {
          const data = await backendFetch(`/agent/status/${msg.taskId}`);
          panel.webview.postMessage({ command: 'taskStatusResult', data });
        } else if (msg.command === 'startPolling') {
          if (!pollInterval) {
            pollInterval = setInterval(async () => {
              const data = await backendFetch('/agent/tasks?limit=10');
              panel.webview.postMessage({ command: 'tasksResult', data });
            }, 5000);
          }
        } else if (msg.command === 'stopPolling') {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      });

      panel.onDidDispose(() => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      });
    })
  );

  // Quick agent run
  context.subscriptions.push(
    vscode.commands.registerCommand('aiDashboard.runAgent', async () => {
      const type = await vscode.window.showQuickPick(
        ['research', 'monitor', 'automation', 'memory'],
        { placeHolder: 'Select agent type' }
      );
      if (!type) return;

      const input = await vscode.window.showInputBox({
        prompt: `Enter ${type} task description`,
      });
      if (!input) return;

      const result = await backendFetch('/agent/run', {
        method: 'POST',
        body: JSON.stringify({ type, input }),
      });

      if (result.success) {
        vscode.window.showInformationMessage(`Agent started: ${result.data.taskId}`);
      } else {
        vscode.window.showErrorMessage(`Agent error: ${result.error}`);
      }
    })
  );

  // Health check
  context.subscriptions.push(
    vscode.commands.registerCommand('aiDashboard.health', async () => {
      const result = await backendFetch('/health');
      if (result.success) {
        const checks = Object.entries(result.data.checks)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        vscode.window.showInformationMessage(`System: ${result.data.status} (${checks})`);
      } else {
        vscode.window.showErrorMessage(`Health check failed: ${result.error || 'Unknown error'}`);
      }
    })
  );
}

function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); line-height: 1.5; }
    h1 { font-size: 1.5em; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
    .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-widget-border); }
    .tab { padding: 8px 16px; cursor: pointer; border: none; background: transparent; color: var(--vscode-foreground); font-size: 13px; opacity: 0.7; border-bottom: 2px solid transparent; }
    .tab:hover { opacity: 1; }
    .tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
    .panel { display: none; }
    .panel.active { display: block; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 1.1em; margin-bottom: 10px; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    input, select, button, textarea { font-family: inherit; font-size: 13px; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; white-space: nowrap; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    input, textarea { width: 100%; }
    select { min-width: 140px; }
    pre { background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; margin-top: 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge.ok, .badge.completed { background: #2ea04333; color: #2ea043; }
    .badge.error, .badge.failed { background: #f8514933; color: #f85149; }
    .badge.pending, .badge.planning { background: #848d9733; color: #848d97; }
    .badge.executing { background: #a371f733; color: #a371f7; }
    .badge.degraded { background: #d29922aa; color: #d29922; }
    .task-list { list-style: none; }
    .task-item { padding: 8px 12px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .task-item:hover { background: var(--vscode-list-hoverBackground); }
    .task-meta { font-size: 11px; opacity: 0.7; }
    .loader { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--vscode-foreground); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty { opacity: 0.5; font-style: italic; padding: 12px; }
  </style>
</head>
<body>
  <h1>AI Dashboard</h1>

  <div class="tabs">
    <button class="tab active" data-panel="agents">Agents</button>
    <button class="tab" data-panel="search">Search</button>
    <button class="tab" data-panel="browse">Browse</button>
    <button class="tab" data-panel="memory">Memory</button>
    <button class="tab" data-panel="system">System</button>
  </div>

  <!-- Agents Panel -->
  <div id="agents" class="panel active">
    <div class="section">
      <h2>Run Agent</h2>
      <div class="row">
        <select id="agentType">
          <option value="research">Research</option>
          <option value="monitor">Monitor</option>
          <option value="automation">Automation</option>
          <option value="memory">Memory</option>
        </select>
        <input id="agentInput" placeholder="Task description..." style="flex:1" />
        <button id="agentBtn">Run</button>
      </div>
      <pre id="agentResult" style="display:none"></pre>
    </div>
    <div class="section">
      <h2>Recent Tasks <button class="secondary" id="refreshTasks" style="font-size:11px;padding:3px 8px;">Refresh</button></h2>
      <ul class="task-list" id="taskList"><li class="empty">Click Refresh to load tasks</li></ul>
    </div>
    <pre id="taskDetail" style="display:none"></pre>
  </div>

  <!-- Search Panel -->
  <div id="search" class="panel">
    <div class="section">
      <h2>Web Search</h2>
      <div class="row">
        <input id="searchInput" placeholder="Search query..." style="flex:1" />
        <button id="searchBtn">Search</button>
      </div>
      <pre id="searchResult" style="display:none"></pre>
    </div>
  </div>

  <!-- Browse Panel -->
  <div id="browse" class="panel">
    <div class="section">
      <h2>Browse URL</h2>
      <div class="row">
        <input id="browseInput" placeholder="https://example.com" style="flex:1" />
        <button id="browseBtn">Browse</button>
      </div>
      <pre id="browseResult" style="display:none"></pre>
    </div>
  </div>

  <!-- Memory Panel -->
  <div id="memory" class="panel">
    <div class="section">
      <h2>Search Memory</h2>
      <div class="row">
        <input id="memoryInput" placeholder="Search stored memories..." style="flex:1" />
        <button id="memoryBtn">Search</button>
      </div>
      <pre id="memoryResult" style="display:none"></pre>
    </div>
  </div>

  <!-- System Panel -->
  <div id="system" class="panel">
    <div class="section">
      <h2>Health Check</h2>
      <button id="healthBtn">Check Health</button>
      <div id="healthResult" style="margin-top:8px"></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

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
    document.getElementById('agentBtn').addEventListener('click', () => {
      const type = document.getElementById('agentType').value;
      const input = document.getElementById('agentInput').value.trim();
      if (!input) return;
      document.getElementById('agentResult').style.display = 'block';
      document.getElementById('agentResult').innerHTML = '<span class="loader"></span> Running...';
      vscode.postMessage({ command: 'runAgent', type, input });
    });

    document.getElementById('refreshTasks').addEventListener('click', () => {
      vscode.postMessage({ command: 'listTasks' });
    });

    // Search
    document.getElementById('searchBtn').addEventListener('click', () => {
      const q = document.getElementById('searchInput').value.trim();
      if (!q) return;
      document.getElementById('searchResult').style.display = 'block';
      document.getElementById('searchResult').innerHTML = '<span class="loader"></span> Searching...';
      vscode.postMessage({ command: 'search', query: q });
    });

    // Browse
    document.getElementById('browseBtn').addEventListener('click', () => {
      const url = document.getElementById('browseInput').value.trim();
      if (!url) return;
      document.getElementById('browseResult').style.display = 'block';
      document.getElementById('browseResult').innerHTML = '<span class="loader"></span> Browsing...';
      vscode.postMessage({ command: 'browse', url });
    });

    // Memory
    document.getElementById('memoryBtn').addEventListener('click', () => {
      const q = document.getElementById('memoryInput').value.trim();
      if (!q) return;
      document.getElementById('memoryResult').style.display = 'block';
      document.getElementById('memoryResult').innerHTML = '<span class="loader"></span> Searching memory...';
      vscode.postMessage({ command: 'memorySearch', query: q });
    });

    // Health
    document.getElementById('healthBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'health' });
    });

    // Start auto-polling for tasks
    vscode.postMessage({ command: 'startPolling' });

    // Message handler
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.command === 'healthResult') {
        const el = document.getElementById('healthResult');
        if (msg.data.success) {
          const checks = Object.entries(msg.data.data.checks)
            .map(([k, v]) => k + ': <span class="badge ' + v + '">' + v + '</span>')
            .join(' &nbsp; ');
          el.innerHTML = '<span class="badge ' + msg.data.data.status + '">'
            + msg.data.data.status + '</span> &nbsp; ' + checks
            + '<br><span class="task-meta">Uptime: ' + Math.round(msg.data.data.uptime) + 's</span>';
        } else {
          el.innerHTML = '<span class="badge error">Error</span> ' + (msg.data.error || '');
        }
      } else if (msg.command === 'agentResult') {
        showResult(document.getElementById('agentResult'), msg.data);
      } else if (msg.command === 'searchResult') {
        const el = document.getElementById('searchResult');
        if (msg.data.success && msg.data.data?.results) {
          const items = msg.data.data.results.map(r =>
            '\\u2022 ' + r.title + '\\n  ' + r.url + '\\n  ' + (r.snippet || '').slice(0, 120)
          ).join('\\n\\n');
          el.style.display = 'block';
          el.textContent = items || 'No results found';
        } else {
          showResult(el, msg.data);
        }
      } else if (msg.command === 'browseResult') {
        const el = document.getElementById('browseResult');
        if (msg.data.success && msg.data.data?.text) {
          el.style.display = 'block';
          el.textContent = msg.data.data.text.slice(0, 10000);
        } else {
          showResult(el, msg.data);
        }
      } else if (msg.command === 'memoryResult') {
        showResult(document.getElementById('memoryResult'), msg.data);
      } else if (msg.command === 'tasksResult') {
        const list = document.getElementById('taskList');
        if (msg.data.success && msg.data.data?.length) {
          list.innerHTML = msg.data.data.map(t =>
            '<li class="task-item" data-id="' + t.id + '">'
            + '<div><span class="badge ' + t.status + '">' + t.status + '</span> '
            + '<strong>' + t.type + '</strong></div>'
            + '<span class="task-meta">' + new Date(t.created_at).toLocaleString() + '</span>'
            + '</li>'
          ).join('');
          list.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('click', () => {
              vscode.postMessage({ command: 'taskStatus', taskId: item.dataset.id });
            });
          });
        } else {
          list.innerHTML = '<li class="empty">No tasks found</li>';
        }
      } else if (msg.command === 'taskStatusResult') {
        showResult(document.getElementById('taskDetail'), msg.data);
      }
    });
  </script>
</body>
</html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
