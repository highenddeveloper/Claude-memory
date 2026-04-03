import config from '../config.js';

export async function triggerWebhook(webhookPath, payload = {}) {
  const url = `${config.n8n.webhookUrl}/${webhookPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`n8n webhook error: ${res.status}`);
  return res.json();
}

export async function getWorkflowStatus(executionId) {
  const url = `${config.n8n.url}/api/v1/executions/${executionId}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`n8n API error: ${res.status}`);
  return res.json();
}
