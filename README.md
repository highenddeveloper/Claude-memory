# AI Dashboard Platform

Unified AI agent system. Single backend, single MCP server, single docker-compose. Dokploy-ready.

All open source. No paid tools.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      VS Code Extension (Dashboard)                    │
│                    WebSocket + REST → Backend API                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                        MCP Server (stdio)                             │
│          Claude Code spawns this — exposes 8 tools                    │
│    web_search · browse_url · browse_multi · store_memory              │
│    recall_memory · run_agent · agent_status · trigger_workflow         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP
┌───────────────────────────────▼──────────────────────────────────────┐
│                    Backend API (Node.js + Express)                     │
│                                                                        │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│   │   Agent    │ │  Search    │ │  Browse    │ │  Memory    │        │
│   │  Engine    │ │  Service   │ │  Service   │ │  Service   │        │
│   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘        │
│         └───────────────┴───────────────┴───────────────┘              │
│                           Service Layer                                │
└────┬────────────┬───────────────┬───────────────┬────────────────────┘
     │            │               │               │
┌────▼───┐  ┌────▼─────┐  ┌─────▼─────┐  ┌─────▼────┐  ┌──────────┐
│SearXNG │  │Browserless│  │PostgreSQL │  │  Valkey  │  │  Qdrant  │
│ search │  │ headless  │  │  memory   │  │  cache   │  │ vectors  │
│  :8080 │  │  chrome   │  │  :5432    │  │  :6379   │  │  :6333   │
└────────┘  │  :3000    │  └───────────┘  └──────────┘  └──────────┘
            └───────────┘
                              ┌──────────┐
                              │   n8n    │
                              │ workflows│
                              │  :5678   │
                              └──────────┘

All services on internal Docker network (ai-net).
Only backend:${BACKEND_PORT:-3101}->3001 and n8n:5678 are exposed externally.
```

---

## Project Structure

```
├── CLAUDE.md                      # AI agent instructions (read this first)
├── AGENTS.md                      # Agent types, memory arch, orchestration
├── docker-compose.yml             # Single file — all 7 services
├── .env.example                   # Environment template
├── .mcp.json                      # MCP config for Claude Code
│
├── backend/
│   ├── server.js                  # Express app entry
│   ├── config.js                  # Centralized config from env vars
│   ├── Dockerfile                 # Node 20 Alpine
│   ├── package.json
│   ├── middleware/
│   │   ├── auth.js                # API key auth (skip for Docker internal)
│   │   ├── rate-limit.js          # 100 req/min external
│   │   └── error-handler.js       # Centralized error handling
│   ├── routes/
│   │   ├── health.js              # GET /health
│   │   ├── search.js              # POST /search
│   │   ├── browse.js              # POST /browse, POST /browse/multi
│   │   ├── memory.js              # CRUD /memory
│   │   ├── agent.js               # POST /agent/run, GET /agent/status/:id
│   │   └── workflow.js            # POST /workflow/trigger
│   ├── services/
│   │   ├── searxng.js             # SearXNG client (cache-aside)
│   │   ├── browserless.js         # Browserless client (parallel browse)
│   │   ├── postgres.js            # Connection pool
│   │   ├── valkey.js              # Cache get/set/del
│   │   ├── qdrant.js              # Vector upsert/search
│   │   └── n8n.js                 # Webhook trigger
│   ├── agent/
│   │   └── engine.js              # Multi-step agent orchestrator
│   ├── mcp/
│   │   └── server.js              # MCP stdio server (8 tools)
│   └── migrations/
│       └── init.sql               # PostgreSQL schema
│
├── config/
│   └── searxng/
│       ├── settings.yml           # SearXNG engine config
│       └── limiter.toml           # Rate limiter disabled for internal
│
└── extension/                     # VS Code extension (dashboard UI)
    ├── package.json
    └── src/
        └── extension.js
```

---

## Tech Stack (All Open Source)

| Layer | Tool | Purpose | Why This |
|-------|------|---------|----------|
| **Backend** | Node.js + Express | API gateway | Simple, fast, huge ecosystem |
| **Protocol** | MCP SDK | Claude ↔ tools | Official Anthropic protocol |
| **Search** | SearXNG | Web search | Privacy-respecting, self-hosted, 70+ engines |
| **Browse** | Browserless | Headless Chrome | Clean API, parallel sessions, built for automation |
| **Database** | PostgreSQL 16 | Persistent memory | The standard. JSONB + full-text search built in |
| **Cache** | Valkey 8 | Fast cache | Redis fork, fully open source (BSD), LRU eviction |
| **Vectors** | Qdrant | Semantic search | Rust-based, fast, REST API, no complex setup |
| **Automation** | n8n | Workflows | Visual editor, 400+ integrations, self-hosted |
| **Deploy** | Docker Compose | Orchestration | Single file, Dokploy-compatible |
| **Validation** | Zod | Schema validation | Runtime type checking, MCP-native |

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/your-username/ai-dashboard.git
cd ai-dashboard
cp .env.example .env
# Edit .env — set API_KEY and passwords
```

### 2. Start everything

```bash
docker-compose up -d
```

### 3. Verify

```bash
curl http://localhost:3101/health
```

### 4. Connect Claude Code

The `.mcp.json` is already configured. Claude Code will auto-discover it.

---

## API Reference

All routes return `{ success: boolean, data?: any, error?: string }`.

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| GET | `/health` | — | Service health checks |
| POST | `/search` | `{ query, maxResults?, categories? }` | Web search via SearXNG |
| POST | `/browse` | `{ url, maxLength? }` | Fetch page content |
| POST | `/browse/multi` | `{ urls }` | Parallel page fetch (max 10) |
| POST | `/memory` | `{ content, summary?, sourceUrl? }` | Store memory entry |
| GET | `/memory/search?q=&limit=` | — | Search memory |
| GET | `/memory/:id` | — | Get single entry |
| DELETE | `/memory/:id` | — | Delete entry |
| POST | `/agent/run` | `{ type, input }` | Start agent task |
| GET | `/agent/status/:id` | — | Get task status |
| GET | `/agent/tasks?limit=` | — | List recent tasks |
| POST | `/workflow/trigger` | `{ webhook, payload? }` | Trigger n8n workflow |

Auth: `X-API-Key` header required for external requests.

---

## MCP Tools (for Claude Code)

| Tool | What It Does |
|------|-------------|
| `web_search` | Search the web, returns titles + URLs + snippets |
| `browse_url` | Extract text from any URL via headless Chrome |
| `browse_multi` | Browse multiple URLs in parallel |
| `store_memory` | Save info to long-term PostgreSQL memory |
| `recall_memory` | Search memory for relevant past information |
| `run_agent` | Launch autonomous agent (research/monitor/automation/memory) |
| `agent_status` | Check if an agent task is done |
| `trigger_workflow` | Fire an n8n webhook |
| `system_health` | Check all service health |

---

## Agent Types

| Type | What It Does | Services Used |
|------|-------------|---------------|
| **research** | Search → browse top results → store findings | SearXNG, Browserless, PostgreSQL, Valkey, Qdrant |
| **monitor** | Fetch URL → diff against previous → alert on change | Browserless, PostgreSQL, Valkey, n8n |
| **automation** | Trigger n8n workflow with payload | n8n, PostgreSQL |
| **memory** | Search/retrieve from long-term knowledge base | PostgreSQL, Valkey, Qdrant |

---

## Docker Network Design

```
┌─────────────────── ai-net (bridge) ───────────────────┐
│                                                         │
│  backend ──→ searxng (internal only)                    │
│  backend ──→ browserless (internal only)                │
│  backend ──→ postgres (internal only)                   │
│  backend ──→ valkey (internal only)                     │
│  backend ──→ qdrant (internal only)                     │
│  backend ──→ n8n (internal + webhook port exposed)      │
│                                                         │
└─────────────────────────────────────────────────────────┘

External access: backend:${BACKEND_PORT:-3101}->3001, n8n:5678 only
Internal services: NO host port bindings
```

---

## Security

- **API key auth** on all external routes (middleware)
- **Docker internal bypass** — requests from 172.x skip auth
- **Rate limiting** — 100 req/min per IP (external only)
- **Helmet.js** — security headers
- **Input validation** — Zod schemas on every endpoint
- **No secrets in code** — `.env` only, `.env` in `.gitignore`
- **Pinned Docker images** — no `:latest` tags

---

## Caching Strategy

| Data Type | Store | TTL | Key Format |
|-----------|-------|-----|------------|
| Search results | Valkey | 1 hour | `search:web:{sha256}` |
| Page content | Valkey | 24 hours | `browse:page:{sha256}` |
| Agent context | Valkey | 2 hours | `agent:{taskId}:context` |
| Long-term memory | PostgreSQL + Qdrant | Permanent | UUID |

Pattern: **cache-aside** — check cache → miss → fetch → store.

---

## Deployment (Dokploy)

1. Push repo to GitHub
2. In Dokploy: **New Project → Docker Compose**
3. Connect GitHub repo
4. Set environment variables from `.env.example`
5. Deploy

Dokploy reads `docker-compose.yml` from root and deploys all 7 services.

---

## Performance Notes

- **Parallel browsing:** Browserless handles 5 concurrent sessions, agent uses batch of 3
- **Connection pooling:** PostgreSQL max 20 connections, Valkey persistent connections
- **Cache-first:** All search/browse hits check Valkey before external calls
- **Async agents:** Agent tasks run in background, API returns immediately
- **Minimal overhead:** MCP server is a thin HTTP bridge, no state

---

## Risks & Trade-offs

| Risk | Mitigation |
|------|-----------|
| SearXNG rate-limited by upstream engines | Rotate engines, cache aggressively |
| Browserless memory usage with many sessions | Cap at 5 concurrent, 60s timeout |
| PostgreSQL single point of failure | Use Docker volume persistence, daily pg_dump |
| Valkey data loss on restart | appendonly + periodic save enabled |
| n8n complexity for simple automations | Optional service, can be removed |
| Single-server deployment | Sufficient for v1, horizontal scaling via container replicas in v2 |

---

## Future Upgrade Path

1. **Multi-agent coordination** — Valkey pub/sub for agent-to-agent messaging
2. **RAG pipeline** — Qdrant + local embedding model for semantic memory
3. **WebSocket streaming** — Real-time agent step updates to VS Code extension
4. **SaaS mode** — Multi-tenant with per-user API keys and usage quotas
5. **Horizontal scaling** — Docker Swarm or Kubernetes, stateless backend replicas
6. **Local LLM** — Ollama integration as alternative to Claude API

---

## License

MIT
