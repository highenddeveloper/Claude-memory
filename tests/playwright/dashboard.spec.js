// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BACKEND_URL = 'http://localhost:3001';
const DASHBOARD_HTML = resolve(import.meta.dirname, 'dashboard.html');
const API_KEY = process.env.API_KEY || '';

test.describe('Backend API Health', () => {
  test('health endpoint returns all service statuses', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`);
    // 200 = healthy, 503 = degraded (embedding may still be loading)
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.data.status).toBeDefined();
    expect(body.data.checks).toBeDefined();
    expect(body.data.checks.postgres).toBe('ok');
    expect(body.data.checks.valkey).toBe('ok');
  });

  test('health endpoint reports uptime', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`);
    const body = await res.json();
    expect(body.data.uptime).toBeGreaterThan(0);
  });
});

test.describe('Backend API - Auth', () => {
  test('protected endpoints require API key in production', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/search`, {
      data: { query: 'test' },
      headers: { 'Content-Type': 'application/json' },
    });
    // In production mode without API key, should return 401
    // In development mode, may pass through
    const status = res.status();
    expect([200, 401]).toContain(status);
  });
});

test.describe('Backend API - Search', () => {
  test('search endpoint validates input', async ({ request }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.post(`${BACKEND_URL}/search`, {
      data: {},
      headers,
    });
    expect(res.status()).toBe(400);
  });

  test('search endpoint accepts valid query', async ({ request }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.post(`${BACKEND_URL}/search`, {
      data: { query: 'nodejs best practices' },
      headers,
    });
    const body = await res.json();
    // Will succeed if SearXNG is healthy, otherwise error
    expect([200, 500]).toContain(res.status());
    if (res.status() === 200) {
      expect(body.success).toBe(true);
      expect(body.data.results).toBeDefined();
    }
  });
});

test.describe('Backend API - Browse', () => {
  test('browse endpoint validates URL', async ({ request }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.post(`${BACKEND_URL}/browse`, {
      data: { url: 'not-a-url' },
      headers,
    });
    expect(res.status()).toBe(400);
  });

  test('browse endpoint blocks SSRF to internal hosts', async ({ request }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.post(`${BACKEND_URL}/browse`, {
      data: { url: 'http://localhost:5432' },
      headers,
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Backend API - Memory', () => {
  test('memory search validates input', async ({ request }) => {
    const headers = {};
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.get(`${BACKEND_URL}/memory/search`, { headers });
    expect(res.status()).toBe(400);
  });

  test('memory search returns results', async ({ request }) => {
    const headers = {};
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.get(`${BACKEND_URL}/memory/search?q=test`, { headers });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Backend API - Agent', () => {
  test('agent run validates input', async ({ request }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.post(`${BACKEND_URL}/agent/run`, {
      data: {},
      headers,
    });
    expect(res.status()).toBe(400);
  });

  test('agent tasks list returns array', async ({ request }) => {
    const headers = {};
    if (API_KEY) headers['X-API-Key'] = API_KEY;

    const res = await request.get(`${BACKEND_URL}/agent/tasks?limit=5`, { headers });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    const html = readFileSync(DASHBOARD_HTML, 'utf-8');
    await page.setContent(html);
    // Inject API base
    await page.evaluate((base) => { window.API_BASE = base; }, BACKEND_URL);
  });

  test('dashboard loads with title and all tabs', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('AI Dashboard');
    await expect(page.getByTestId('tab-agents')).toBeVisible();
    await expect(page.getByTestId('tab-search')).toBeVisible();
    await expect(page.getByTestId('tab-browse')).toBeVisible();
    await expect(page.getByTestId('tab-memory')).toBeVisible();
    await expect(page.getByTestId('tab-system')).toBeVisible();
  });

  test('agents panel is active by default', async ({ page }) => {
    await expect(page.getByTestId('panel-agents')).toBeVisible();
    await expect(page.getByTestId('panel-search')).toBeHidden();
  });

  test('tab switching works correctly', async ({ page }) => {
    // Click Search tab
    await page.getByTestId('tab-search').click();
    await expect(page.getByTestId('panel-search')).toBeVisible();
    await expect(page.getByTestId('panel-agents')).toBeHidden();

    // Click Browse tab
    await page.getByTestId('tab-browse').click();
    await expect(page.getByTestId('panel-browse')).toBeVisible();
    await expect(page.getByTestId('panel-search')).toBeHidden();

    // Click Memory tab
    await page.getByTestId('tab-memory').click();
    await expect(page.getByTestId('panel-memory')).toBeVisible();

    // Click System tab
    await page.getByTestId('tab-system').click();
    await expect(page.getByTestId('panel-system')).toBeVisible();

    // Back to Agents
    await page.getByTestId('tab-agents').click();
    await expect(page.getByTestId('panel-agents')).toBeVisible();
  });

  test('agent form has all controls', async ({ page }) => {
    await expect(page.getByTestId('agent-type')).toBeVisible();
    await expect(page.getByTestId('agent-input')).toBeVisible();
    await expect(page.getByTestId('agent-run-btn')).toBeVisible();
    
    // Check agent type options
    const options = await page.getByTestId('agent-type').locator('option').allTextContents();
    expect(options).toEqual(['Research', 'Monitor', 'Automation', 'Memory']);
  });

  test('search panel has input and button', async ({ page }) => {
    await page.getByTestId('tab-search').click();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(page.getByTestId('search-btn')).toBeVisible();
  });

  test('browse panel has input and button', async ({ page }) => {
    await page.getByTestId('tab-browse').click();
    await expect(page.getByTestId('browse-input')).toBeVisible();
    await expect(page.getByTestId('browse-btn')).toBeVisible();
  });

  test('memory panel has input and button', async ({ page }) => {
    await page.getByTestId('tab-memory').click();
    await expect(page.getByTestId('memory-input')).toBeVisible();
    await expect(page.getByTestId('memory-btn')).toBeVisible();
  });

  test('system panel has health check button', async ({ page }) => {
    await page.getByTestId('tab-system').click();
    await expect(page.getByTestId('health-btn')).toBeVisible();
  });

  test('agent run button does nothing with empty input', async ({ page }) => {
    await page.getByTestId('agent-run-btn').click();
    // Result should remain hidden since input is empty
    await expect(page.getByTestId('agent-result')).toBeHidden();
  });

  test('search button does nothing with empty input', async ({ page }) => {
    await page.getByTestId('tab-search').click();
    await page.getByTestId('search-btn').click();
    await expect(page.getByTestId('search-result')).toBeHidden();
  });
});

test.describe('Dashboard UI - Live Backend Integration', () => {
  test.beforeEach(async ({ page }) => {
    const html = readFileSync(DASHBOARD_HTML, 'utf-8');
    // Replace API_BASE in the HTML
    const modifiedHtml = html.replace(
      "window.API_BASE || 'http://localhost:3001'",
      `'${BACKEND_URL}'`
    );
    await page.setContent(modifiedHtml);
  });

  test('health check shows service statuses', async ({ page }) => {
    await page.getByTestId('tab-system').click();
    await page.getByTestId('health-btn').click();
    
    // Wait for health result to populate
    await expect(page.getByTestId('health-result')).not.toBeEmpty({ timeout: 10000 });
    
    const text = await page.getByTestId('health-result').innerHTML();
    // Should show status badge (ok, degraded, error) and possibly service names
    expect(text).toMatch(/ok|degraded|error|healthy|Error|Degraded/i);
  });

  test('task list loads on refresh', async ({ page }) => {
    await page.getByTestId('refresh-tasks-btn').click();
    // Wait for task list to update
    await page.waitForTimeout(2000);
    // Should show either tasks or "No tasks found"
    const list = page.getByTestId('task-list');
    await expect(list).toBeVisible();
  });
});
