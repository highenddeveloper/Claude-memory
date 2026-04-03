#!/usr/bin/env node

/**
 * MCP Server — Bridge between Claude Code and the Backend API
 *
 * This runs as a stdio process spawned by Claude. It registers tools
 * that map to backend HTTP endpoints. All logic lives in the backend;
 * this is a thin translation layer.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || '';
const FETCH_TIMEOUT = 30000;

async function backendFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  };
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Backend ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || `Backend error`);
  return data.data;
}

const server = new McpServer({
  name: 'ai-dashboard',
  version: '1.0.0',
});

// ─── Web Search ───
server.tool(
  'web_search',
  'Search the web using SearXNG. Returns titles, URLs, and snippets.',
  {
    query: z.string().describe('Search query text'),
    maxResults: z.number().optional().describe('Max results (1-50, default 10)'),
    categories: z.string().optional().describe('Search categories (general, news, images, etc.)'),
  },
  async ({ query, maxResults, categories }) => {
    const data = await backendFetch('/search', {
      method: 'POST',
      body: JSON.stringify({ query, maxResults, categories }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Browse URL ───
server.tool(
  'browse_url',
  'Fetch and extract text content from a web page using headless Chrome.',
  {
    url: z.string().url().describe('URL to browse'),
    maxLength: z.number().optional().describe('Max content length (default 50000)'),
  },
  async ({ url, maxLength }) => {
    const data = await backendFetch('/browse', {
      method: 'POST',
      body: JSON.stringify({ url, maxLength }),
    });
    return {
      content: [{ type: 'text', text: data.text || JSON.stringify(data) }],
    };
  }
);

// ─── Browse Multiple URLs ───
server.tool(
  'browse_multi',
  'Fetch text content from multiple URLs in parallel.',
  {
    urls: z.array(z.string().url()).min(1).max(10).describe('URLs to browse'),
  },
  async ({ urls }) => {
    const data = await backendFetch('/browse/multi', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Store Memory ───
server.tool(
  'store_memory',
  'Store information in long-term memory (PostgreSQL).',
  {
    content: z.string().describe('Content to store'),
    summary: z.string().optional().describe('Short summary'),
    sourceUrl: z.string().optional().describe('Source URL if applicable'),
  },
  async ({ content, summary, sourceUrl }) => {
    const data = await backendFetch('/memory', {
      method: 'POST',
      body: JSON.stringify({ content, summary, sourceUrl }),
    });
    return {
      content: [{ type: 'text', text: `Stored memory: ${data.id}` }],
    };
  }
);

// ─── Recall Memory ───
server.tool(
  'recall_memory',
  'Search long-term memory for relevant information.',
  {
    query: z.string().describe('Search query for memory'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ query, limit }) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', String(limit));
    const data = await backendFetch(`/memory/search?${params}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Run Agent ───
server.tool(
  'run_agent',
  'Execute an autonomous agent task. Types: research (web research), monitor (track URL changes), automation (trigger n8n workflow), memory (search/store knowledge).',
  {
    type: z.enum(['research', 'monitor', 'automation', 'memory']).describe('Agent type'),
    input: z.string().describe('Task description or query'),
  },
  async ({ type, input }) => {
    const data = await backendFetch('/agent/run', {
      method: 'POST',
      body: JSON.stringify({ type, input }),
    });
    return {
      content: [{ type: 'text', text: `Agent task started: ${data.taskId} (${data.type})` }],
    };
  }
);

// ─── Agent Status ───
server.tool(
  'agent_status',
  'Check the status of a running agent task.',
  {
    taskId: z.string().describe('UUID of the agent task'),
  },
  async ({ taskId }) => {
    const data = await backendFetch(`/agent/status/${taskId}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Trigger Workflow ───
server.tool(
  'trigger_workflow',
  'Trigger an n8n automation workflow via webhook.',
  {
    webhook: z.string().describe('Webhook path in n8n'),
    payload: z.string().optional().describe('JSON payload string'),
  },
  async ({ webhook, payload }) => {
    let parsed = {};
    if (payload) {
      try { parsed = JSON.parse(payload); } catch { parsed = { input: payload }; }
    }
    const data = await backendFetch('/workflow/trigger', {
      method: 'POST',
      body: JSON.stringify({ webhook, payload: parsed }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Health Check ───
server.tool(
  'system_health',
  'Check the health of all backend services.',
  {},
  async () => {
    const data = await backendFetch('/health');
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── List Agent Tasks ───
server.tool(
  'list_tasks',
  'List recent agent tasks with their status.',
  {
    limit: z.number().int().min(1).max(50).optional().describe('Max tasks to return (default 20)'),
  },
  async ({ limit }) => {
    const params = limit ? `?limit=${limit}` : '';
    const data = await backendFetch(`/agent/tasks${params}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ───
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('MCP server connected via stdio\n');
}

main().catch((err) => {
  process.stderr.write(`MCP server fatal error: ${err.message}\n`);
  process.exit(1);
});
