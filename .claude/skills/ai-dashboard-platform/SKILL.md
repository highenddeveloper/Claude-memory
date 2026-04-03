---
name: ai-dashboard-platform
description: Skill for working with the AI Dashboard Platform. Use when building, debugging, or extending the unified agent backend, MCP server, Docker services, or VS Code extension.
---

# AI Dashboard Platform — Development Skill

## Quick Context

This is a unified AI agent platform with:
- **Backend:** Node.js + Express at `backend/` — routes, services, agent engine
- **MCP Server:** `backend/mcp/server.js` — stdio bridge to backend API
- **Docker Compose:** 7 services on internal `ai-net` network
- **VS Code Extension:** `extension/` — webview dashboard
- **Database:** PostgreSQL (memory + tasks), Valkey (cache), Qdrant (vectors)
- **External Tools:** SearXNG (search), Browserless (browse), n8n (automation)

## Key Files

| What | Where |
|------|-------|
| Project instructions | `CLAUDE.md` |
| Agent architecture | `AGENTS.md` |
| Docker config | `docker-compose.yml` |
| Backend entry | `backend/server.js` |
| Backend config | `backend/config.js` |
| MCP server | `backend/mcp/server.js` |
| Agent engine | `backend/agent/engine.js` |
| DB schema | `backend/migrations/init.sql` |
| SearXNG config | `config/searxng/settings.yml` |
| Extension entry | `extension/src/extension.js` |
| Environment template | `.env.example` |

## Development Commands

```bash
# Start all services
docker-compose up -d

# Watch backend logs
docker-compose logs -f backend

# Restart backend after code changes
docker-compose restart backend

# Run backend locally (without Docker)
cd backend && npm install && npm run dev

# Test MCP server locally
cd backend && BACKEND_URL=http://localhost:3001 node mcp/server.js

# Access PostgreSQL
docker-compose exec postgres psql -U ai -d ai

# Check Valkey
docker-compose exec valkey valkey-cli ping
```

## Architecture Rules

1. MCP server is **stateless** — it just bridges Claude ↔ backend HTTP
2. All services talk over Docker `ai-net` network by container name
3. Only `backend:3001` and `n8n:5678` are exposed externally
4. Cache pattern: check Valkey → miss → fetch → store (cache-aside)
5. Agent tasks run async — POST returns immediately with taskId
6. All routes validate input with Zod schemas
7. API key auth via `X-API-Key` header, skipped for Docker internal IPs

## Common Tasks

### Add a new MCP tool
1. Add route in `backend/routes/`
2. Add service function in `backend/services/`
3. Register tool in `backend/mcp/server.js`

### Add a new agent type
1. Define config in `AGENT_CONFIGS` in `backend/agent/engine.js`
2. Add `execute{Type}` function in same file
3. Add to `run_agent` type enum in MCP server

### Add a new service to Docker
1. Add service block in `docker-compose.yml`
2. Add env vars to `backend/config.js` and `.env.example`
3. Create client in `backend/services/`
4. Add health check in `backend/routes/health.js`

### Debug a failing agent
1. Check task status: `GET /agent/status/{taskId}`
2. Steps array shows each step's status, duration, and errors
3. Check backend logs: `docker-compose logs -f backend`
4. Check individual service: `docker-compose logs {service}`
