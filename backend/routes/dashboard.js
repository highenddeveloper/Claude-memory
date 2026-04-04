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
  <title>Memory Operations Dashboard</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #dde3ea;
      --ok: #137333;
      --warn: #b76e00;
      --err: #c5221f;
      --accent: #0b57d0;
      --accent-2: #0842a0;
      --radius: 10px;
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Segoe UI", "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
    }

    .sub {
      margin-top: 6px;
      color: var(--muted);
      font-size: 14px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e8f0fe;
      color: #174ea6;
      font-weight: 600;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 14px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 14px;
    }

    .card h2 {
      margin: 0 0 10px 0;
      font-size: 16px;
    }

    .col-12 { grid-column: span 12; }
    .col-8 { grid-column: span 8; }
    .col-6 { grid-column: span 6; }
    .col-4 { grid-column: span 4; }

    @media (max-width: 960px) {
      .col-8, .col-6, .col-4 { grid-column: span 12; }
      .header { flex-direction: column; align-items: flex-start; }
    }

    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    input, select, textarea, button {
      font: inherit;
      border-radius: 8px;
      border: 1px solid var(--line);
      padding: 9px 10px;
      background: #fff;
      color: var(--text);
    }

    input, select, textarea { width: 100%; }

    textarea {
      min-height: 110px;
      resize: vertical;
    }

    .grow { flex: 1; }

    button {
      width: auto;
      cursor: pointer;
      background: var(--accent);
      color: white;
      border: none;
      font-weight: 600;
    }

    button:hover { background: var(--accent-2); }

    button.secondary {
      background: #eef3fd;
      color: #234b99;
      border: 1px solid #d5e1fb;
    }

    button.secondary:hover {
      background: #e3ecfb;
    }

    .badge {
      display: inline-block;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 999px;
      font-weight: 600;
      text-transform: lowercase;
    }

    .ok { background: #e6f4ea; color: var(--ok); }
    .healthy { background: #e6f4ea; color: var(--ok); }
    .degraded { background: #fff4e5; color: var(--warn); }
    .error, .failed { background: #fce8e6; color: var(--err); }
    .pending, .planning, .executing { background: #e8f0fe; color: #174ea6; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    @media (max-width: 760px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .kpi {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: #fbfcfe;
    }

    .kpi .name { font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: capitalize; }

    .task-list {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      max-height: 290px;
      overflow-y: auto;
      background: #fff;
    }

    .task-item {
      padding: 10px;
      border-bottom: 1px solid var(--line);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .task-item:last-child { border-bottom: none; }
    .task-item:hover { background: #f8fbff; }

    .task-meta {
      color: var(--muted);
      font-size: 12px;
    }

    pre {
      margin: 10px 0 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f172a;
      color: #e2e8f0;
      max-height: 300px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .muted { color: var(--muted); font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Memory Operations Dashboard</h1>
        <div class="sub">Simple view: run tasks, track progress, and manage memory.</div>
      </div>
      <div id="connection-status" class="status" data-testid="connection-status">Checking...</div>
    </div>

    <div class="grid">
      <section class="card col-12">
        <h2>System Health</h2>
        <div class="row">
          <button id="health-refresh" class="secondary" data-testid="health-refresh-btn">Refresh Health</button>
          <span id="health-summary" class="muted">Waiting for data...</span>
        </div>
        <div id="health-grid" class="kpi-grid" data-testid="health-grid"></div>
      </section>

      <section class="card col-8">
        <h2>Agent Tasks</h2>
        <div class="row">
          <select id="task-type" data-testid="task-type">
            <option value="research">Research</option>
            <option value="monitor">Monitor</option>
            <option value="automation">Automation</option>
            <option value="memory">Memory</option>
          </select>
          <input id="task-input" class="grow" data-testid="task-input" placeholder="Task input (query, URL, or webhook:payload)" />
          <button id="task-run" data-testid="task-run-btn">Run</button>
          <button id="task-refresh" class="secondary" data-testid="task-refresh-btn">Refresh</button>
        </div>
        <div id="task-list" class="task-list" data-testid="task-list"></div>
        <pre id="task-detail" style="display:none" data-testid="task-detail"></pre>
      </section>

      <section class="card col-4">
        <h2>Quick Memory Search</h2>
        <div class="row">
          <input id="memory-search-input" data-testid="memory-search-input" placeholder="Search memory..." />
        </div>
        <div class="row">
          <button id="memory-search-btn" data-testid="memory-search-btn">Search</button>
        </div>
        <pre id="memory-search-result" style="display:none" data-testid="memory-search-result"></pre>
      </section>

      <section class="card col-12">
        <h2>Store Memory</h2>
        <div class="row">
          <input id="memory-summary" data-testid="memory-summary" placeholder="Summary (optional)" />
        </div>
        <div class="row">
          <textarea id="memory-content" data-testid="memory-content" placeholder="Content to store..."></textarea>
        </div>
        <div class="row">
          <button id="memory-store-btn" data-testid="memory-store-btn">Save Memory</button>
        </div>
        <pre id="memory-store-result" style="display:none" data-testid="memory-store-result"></pre>
      </section>
    </div>
  </div>

  <script>
    const API_BASE = '${apiBase}';

    async function apiFetch(path, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(API_BASE + path, { ...options, headers, signal: controller.signal });
        const data = await res.json();
        clearTimeout(timeout);
        return data;
      } catch (err) {
        clearTimeout(timeout);
        return { success: false, error: err.name === 'AbortError' ? 'Request timed out' : err.message };
      }
    }

    function showJson(el, data) {
      el.style.display = 'block';
      el.textContent = JSON.stringify(data, null, 2);
    }

    function statusBadge(value) {
      const cls = String(value || 'unknown').toLowerCase();
      return '<span class="badge ' + cls + '">' + cls + '</span>';
    }

    async function refreshHealth() {
      const data = await apiFetch('/health');
      const statusEl = document.getElementById('connection-status');
      const summaryEl = document.getElementById('health-summary');
      const gridEl = document.getElementById('health-grid');

      if (!data.success || !data.data || !data.data.checks) {
        statusEl.textContent = 'Disconnected';
        summaryEl.textContent = data.error || 'Health check failed';
        gridEl.innerHTML = '';
        return;
      }

      const checks = data.data.checks;
      const overall = data.data.status;
      statusEl.textContent = overall === 'healthy' ? 'Connected' : 'Degraded';
      summaryEl.innerHTML = 'Status: ' + statusBadge(overall) + ' | Uptime: ' + Math.round(data.data.uptime) + 's';
      gridEl.innerHTML = Object.entries(checks).map(([k, v]) =>
        '<div class="kpi"><div class="name">' + k + '</div><div>' + statusBadge(v) + '</div></div>'
      ).join('');
    }

    async function refreshTasks() {
      const listEl = document.getElementById('task-list');
      const data = await apiFetch('/agent/tasks?limit=25');

      if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
        listEl.innerHTML = '<div class="task-item"><span class="muted">No tasks yet</span></div>';
        return;
      }

      listEl.innerHTML = data.data.map((task) => {
        return '<div class="task-item" data-id="' + task.id + '">'
          + '<div><strong>' + task.type + '</strong><div class="task-meta">' + new Date(task.created_at).toLocaleString() + '</div></div>'
          + statusBadge(task.status)
          + '</div>';
      }).join('');

      listEl.querySelectorAll('.task-item[data-id]').forEach((row) => {
        row.addEventListener('click', async () => {
          const details = await apiFetch('/agent/status/' + row.dataset.id);
          showJson(document.getElementById('task-detail'), details);
        });
      });
    }

    async function runTask() {
      const type = document.getElementById('task-type').value;
      const input = document.getElementById('task-input').value.trim();
      if (!input) return;

      const detail = document.getElementById('task-detail');
      detail.style.display = 'block';
      detail.textContent = 'Starting task...';

      const data = await apiFetch('/agent/run', {
        method: 'POST',
        body: JSON.stringify({ type, input }),
      });

      showJson(detail, data);
      await refreshTasks();
    }

    async function searchMemory() {
      const q = document.getElementById('memory-search-input').value.trim();
      if (!q) return;
      const data = await apiFetch('/memory/search?q=' + encodeURIComponent(q));
      showJson(document.getElementById('memory-search-result'), data);
    }

    async function storeMemory() {
      const content = document.getElementById('memory-content').value.trim();
      const summary = document.getElementById('memory-summary').value.trim();
      if (!content) return;

      const data = await apiFetch('/memory', {
        method: 'POST',
        body: JSON.stringify({ content, summary: summary || undefined }),
      });

      showJson(document.getElementById('memory-store-result'), data);
      if (data.success) {
        document.getElementById('memory-content').value = '';
        document.getElementById('memory-summary').value = '';
      }
    }

    document.getElementById('health-refresh').addEventListener('click', refreshHealth);
    document.getElementById('task-refresh').addEventListener('click', refreshTasks);
    document.getElementById('task-run').addEventListener('click', runTask);
    document.getElementById('memory-search-btn').addEventListener('click', searchMemory);
    document.getElementById('memory-store-btn').addEventListener('click', storeMemory);

    refreshHealth();
    refreshTasks();
    setInterval(refreshHealth, 30000);
    setInterval(refreshTasks, 15000);
  </script>
</body>
</html>`;
}

export default router;
