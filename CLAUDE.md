# CLAUDE.md — Project Instructions for AI Agents

## Project Identity

**Name:** AI Dashboard Platform
**Type:** Unified AI agent platform with self-hosted tooling
**Stack:** Node.js + Express, Rust (Axum + ONNX Runtime), Go (stdlib), MCP, Docker Compose, PostgreSQL, Valkey, Qdrant, SearXNG, Browserless, n8n
**Deployment:** Dokploy (single GitHub repo, single docker-compose)
**Languages:** JavaScript (backend orchestration), Rust (ML inference), Go (monitoring + CLI)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VS Code Extension (Dashboard UI)              │
│                  WebSocket + REST ↔ Backend API                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     MCP Server (stdio)                           │
│              Exposes tools to Claude Code                        │
│         search · browse · memory · cache · automate              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Backend API (Node.js + Express)                 │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Agent    │ │ Search   │ │ Browse   │ │ Memory   │           │
│  │ Engine   │ │ Service  │ │ Service  │ │ Service  │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │             │             │             │                 │
│  ┌────▼─────────────▼─────────────▼─────────────▼──────────┐    │
│  │              Service Router / Orchestrator                │    │
│  └──┬──────────┬──────────┬──────────┬──────────┬──────────┘    │
└─────┼──────────┼──────────┼──────────┼──────────┼───────────────┘
      │          │          │          │          │
┌─────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌──▼─────────┐
│ SearXNG │ │Browser-│ │Postgre-│ │ Valkey │ │ Embedding  │ ← Rust
│  :8080  │ │less    │ │SQL     │ │ :6379  │ │ :8000 ONNX │
└─────────┘ │ :3000  │ │ :5432  │ └────────┘ └────────────┘
            └────────┘ └───┬────┘
                     ┌─────▼────┐  ┌────────┐  ┌──────────┐
                     │  Qdrant  │  │  n8n   │  │ Monitor  │ ← Go
                     │  :6333   │  │ :5678  │  │  :8001   │
                     └──────────┘  └────────┘  └──────────┘
```

All services are **self-contained** inside Docker Compose — no external API dependencies.
Services communicate over an internal bridge network (`ai-net`). Only backend (3001) and n8n (5678) are exposed.

---

## Core Conventions

### Code Style
- **Backend:** Node.js ESM modules, no TypeScript (keep it simple)
- **Rust:** Idiomatic Rust with Axum, `ort` for ONNX inference, `tokio` async runtime
- **Go:** Standard library only (no external deps), net/http for servers
- **Naming:** camelCase for variables/functions, PascalCase for classes, kebab-case for files
- **Async:** Always use async/await, never raw callbacks
- **Error handling:** Centralized error middleware in Express, structured error objects
- **Logging:** Use `pino` — JSON structured logs, no console.log in production

### File Organization
```
backend/
├── server.js              # Express app bootstrap
├── config.js              # Environment config loader
├── Dockerfile
├── package.json
├── routes/
│   ├── agent.js           # POST /agent/run, GET /agent/status/:id
│   ├── search.js          # POST /search
│   ├── browse.js          # POST /browse
│   ├── memory.js          # CRUD /memory + POST /memory/vector-search
│   └── health.js          # GET /health (postgres, valkey, qdrant, embedding)
├── services/
│   ├── searxng.js         # SearXNG HTTP client
│   ├── browserless.js     # Browserless HTTP client (SSRF-protected)
│   ├── postgres.js        # PostgreSQL connection pool (pg)
│   ├── valkey.js          # Valkey/Redis client (ioredis)
│   ├── qdrant.js          # Qdrant vector client
│   ├── embedding.js       # Client for Rust embedding server
│   └── n8n.js             # n8n webhook trigger client
├── agent/
│   ├── engine.js          # Multi-step agent orchestrator (FTS + vector search)
│   ├── planner.js         # Task decomposition
│   ├── executor.js        # Step execution
│   └── memory.js          # Agent memory (short-term + long-term)
├── mcp/
│   ├── server.js          # MCP stdio server entry
│   ├── tools.js           # Tool definitions
│   └── handlers.js        # Tool execution handlers
└── middleware/
    ├── auth.js            # API key + timing-safe comparison
    ├── rateLimit.js       # Rate limiting (Docker CIDR bypass)
    └── errorHandler.js    # Zod + operational error handling

services/
├── embedding/             # Rust: ONNX embedding server (384-dim)
│   ├── Cargo.toml         # axum, ort, tokenizers, ndarray
│   ├── Dockerfile         # 3-stage: model-prep → build → runtime
│   └── src/
│       └── main.rs        # POST /embed, GET /health
├── monitor/               # Go: Service health monitor
│   ├── go.mod
│   ├── Dockerfile         # 2-stage: build → alpine
│   └── main.go            # Polls all services, GET /status, /health

tools/
├── ai-cli/                # Go: Command-line interface
│   ├── go.mod
│   └── main.go            # health, search, browse, agent, memory
```

### API Design
- All endpoints return `{ success: boolean, data?: any, error?: string }`
- Use HTTP status codes correctly (200, 201, 400, 401, 429, 500)
- Rate limit: 100 req/min per API key for external, unlimited for internal Docker network
- All POST bodies are JSON, validated with `zod`

### Database Conventions (PostgreSQL)
- Table names: snake_case, plural (`agent_tasks`, `memory_entries`)
- Always include `id` (UUID), `created_at`, `updated_at`
- Use connection pooling (pg Pool, max 20 connections)
- Migrations in `backend/migrations/` using `node-pg-migrate`

### Cache Strategy (Valkey)
- Key format: `{service}:{action}:{hash}` (e.g., `search:web:abc123`)
- Default TTL: 1 hour for search, 24 hours for browse content
- Use hash of query params as cache key
- Cache-aside pattern: check cache → miss → fetch → store

### Vector DB (Qdrant)
- Collection: `memory_vectors` with 384 dimensions (all-MiniLM-L6-v2 via Rust embedding server)
- Embeddings generated locally — no external API calls
- Use for semantic memory search and RAG
- Batch upsert, single query

---

## MCP Integration

The MCP server runs as a stdio process launched by Claude Code. It does NOT listen on a port — Claude spawns it directly.

### Tool Registration Pattern
```javascript
server.tool("tool_name", "description", { param: z.string() }, async (args) => {
  const result = await backendClient.post("/endpoint", args);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

### MCP Tools Exposed
| Tool | Description | Backend Route |
|------|-------------|---------------|
| `web_search` | Search via SearXNG | POST /search |
| `browse_url` | Fetch page content via Browserless | POST /browse |
| `store_memory` | Save to long-term memory | POST /memory |
| `recall_memory` | Retrieve from memory | GET /memory/search |
| `run_agent` | Execute multi-step agent task | POST /agent/run |
| `agent_status` | Check agent task status | GET /agent/status/:id |
| `trigger_workflow` | Trigger n8n workflow | POST /workflow/trigger |

---

## Docker Network Rules

- **Internal only:** SearXNG, Browserless, PostgreSQL, Valkey, Qdrant, Embedding (Rust), Monitor (Go) — NO ports exposed to host
- **External:** Backend API on port 3001 only
- **Optional external:** n8n on port 5678 (for webhook workflows)
- Network name: `ai-net` (bridge driver)
- All services reference each other by container name (e.g., `http://searxng:8080`)
- **No external API dependencies** — all ML inference runs locally via the Rust ONNX server

---

## Security Rules

1. **Never commit secrets** — use `.env` file, reference via `process.env`
2. **API key auth** — all external requests require `X-API-Key` header
3. **Internal bypass** — requests from Docker internal network skip auth
4. **Rate limiting** — express-rate-limit on all public routes
5. **Input validation** — zod schemas on every endpoint
6. **No eval/exec** — never execute arbitrary code from user input
7. **Helmet.js** — security headers on all responses
8. **CORS** — restrict to known origins only

---

## Commands

```bash
# Development
docker-compose up -d                    # Start all services
docker-compose logs -f backend          # Follow backend logs
docker-compose restart backend          # Restart after code changes

# Database
docker-compose exec backend npx node-pg-migrate up   # Run migrations
docker-compose exec postgres psql -U ai -d ai        # Direct DB access

# Testing
cd backend && npm test                  # Run tests
cd backend && npm run test:integration  # Integration tests

# Production
docker-compose -f docker-compose.yml up -d --build   # Build + deploy
```

---

## Agent Design Principles

1. **Plan before acting** — agent decomposes task into steps before execution
2. **Cache-first** — always check cache before external calls
3. **Fail gracefully** — individual step failure doesn't kill the whole task
4. **Observable** — every step logs to PostgreSQL with timestamps
5. **Idempotent** — re-running a step produces the same result
6. **Time-bounded** — max 5 minutes per agent run, configurable

---

## What NOT to Do

- Don't add TypeScript — keep the stack simple
- Don't add an ORM — use raw SQL with parameterized queries
- Don't expose internal services to the internet
- Don't use `latest` tags in Docker images — pin versions
- Don't store embeddings in PostgreSQL — use Qdrant for vectors
- Don't build a custom auth system — API key is sufficient for v1
- Don't over-abstract — one service file per external tool, that's it
