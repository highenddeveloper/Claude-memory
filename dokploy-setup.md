# Dokploy Deployment Setup

> Deploy the Memory + Dashboard platform to a VPS using [Dokploy](https://dokploy.com). No backend LLM key is required.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| VPS (Ubuntu 22.04+ recommended) | 4 GB RAM minimum, 8 GB+ for embedding model |
| Dokploy installed | `curl -sSL https://dokploy.com/install.sh \| sh` |
| GitHub repo | This repo pushed to `github.com/highenddeveloper/Claude-memory` |
| Domain (optional) | For HTTPS via Traefik reverse proxy |

---

## 1 — Install Dokploy on VPS

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Install Dokploy (includes Docker + Traefik)
curl -sSL https://dokploy.com/install.sh | sh

# Open the Dokploy dashboard
# http://your-vps-ip:3000
```

Complete the initial setup wizard in the browser (set admin password).

---

## 2 — Connect GitHub Repository

1. In Dokploy dashboard → **Settings → Git Providers**
2. Add GitHub and authorize `highenddeveloper/Claude-memory`
3. Dokploy will auto-detect the `docker-compose.yml` at repo root

---

## 3 — Create a New Project

1. Dokploy dashboard → **New Project** → name it `ai-dashboard`
2. **Add Service → Docker Compose**
3. Select GitHub source → choose `highenddeveloper/Claude-memory`
4. Branch: `main`
5. Compose file path: `docker-compose.yml`

---

## 4 — Configure Environment Variables

In Dokploy → your project → **Environment Variables**, add:

```env
# Required
API_KEY=your-very-long-random-api-key-here
POSTGRES_USER=ai
POSTGRES_PASSWORD=change-this-to-a-strong-password
POSTGRES_DB=ai
SEARXNG_SECRET=change-this-searxng-secret
BROWSERLESS_TOKEN=change-this-browserless-token

# n8n
N8N_USER=admin
N8N_PASSWORD=change-this-n8n-password
N8N_EXTERNAL_URL=https://n8n.your-domain.com

# Optional overrides
AGENT_MAX_CONCURRENCY=3
AGENT_TIMEOUT_MS=300000
LOG_LEVEL=info
NODE_ENV=production
BACKEND_HOST_PORT=3101
```

Use a free host port for `BACKEND_HOST_PORT` if `3101` is already in use on your VPS.
If `BACKEND_PORT` exists from older deployments in Dokploy, remove it to avoid confusion.
If `GROQ_API_KEY` or `GROQ_MODEL` exists from older deployments, remove them (not used by backend).

> **Security:** Generate strong random values for all secrets:
> ```bash
> openssl rand -hex 32   # API_KEY, POSTGRES_PASSWORD, etc.
> ```

---

## 5 — Configure Domains (Recommended)

All services run on the internal `ai-net` Docker network. Only expose what you need:

| Service | Internal Port | Expose? | Suggested Domain |
|---------|-----------|---------|-----------------|
| Backend API | 3001 | **Yes** | `api.your-domain.com` |
| n8n | 5678 | Optional | `n8n.your-domain.com` |
| All others | — | **No** | Internal only |

Domain setup flow in Dokploy:
1. Open your project service in Dokploy.
2. Go to **Domains**.
3. Add `api.your-domain.com` to the backend service (port 3001 inside container).
4. Add `n8n.your-domain.com` to n8n service only if you need external webhook/UI access.
5. Enable HTTPS/Let's Encrypt and save.

Traefik will terminate TLS automatically once DNS records point to your VPS.

---

## 6 — Deploy

```bash
# In Dokploy dashboard → your project → click "Deploy"
# Or trigger via webhook on git push
```

Dokploy runs `docker compose up -d --build` on the VPS.

Default deployment is memory/dashboard focused and does not start the optional embedding profile.
Typical deploy time is ~2–4 minutes after image caching.

---

## 7 — Verify Deployment

```bash
# From your local machine (using the Go CLI)
export AI_DASHBOARD_URL=https://api.your-domain.com
export AI_DASHBOARD_API_KEY=your-api-key

cd tools/ai-cli
go run main.go health

# Expected output:
# Service  Status  Latency
# ─────────────────────────
# postgres  ok      12ms
# valkey    ok      2ms
# qdrant    ok      8ms
# embedding error   optional (expected if profile disabled)
```

Or via curl:

```bash
curl -H "X-API-Key: your-api-key" https://api.your-domain.com/health
```

---

## 8 — Auto-Deploy on Push

In Dokploy → your project → **Webhooks**:

1. Copy the Dokploy webhook URL
2. Add it in GitHub: **Repository Settings → Webhooks → Add webhook**
3. Content type: `application/json`
4. Events: `push` to `main`

Every `git push origin main` will now trigger a redeploy automatically.

---

## Service Resource Requirements

| Service | RAM | CPU | Notes |
|---------|-----|-----|-------|
| backend | 512 MB | 1 core | Node.js API |
| embedding (optional profile) | 1 GB | 1 core | Rust + ONNX model |
| postgres | 512 MB | 1 core | Persistent storage |
| qdrant | 512 MB | 0.5 core | Vector DB |
| browserless | 1 GB | 1 core | Chromium |
| searxng | 256 MB | 0.5 core | Search engine |
| valkey | 300 MB | 0.5 core | Cache |
| n8n | 512 MB | 0.5 core | Workflow engine |
| monitor | 64 MB | 0.25 core | Go health monitor |
| **Total (without embedding)** | **~3.7 GB** | **~5 cores** | |
| **Total (with embedding)** | **~4.7 GB** | **~6 cores** | |

**Recommended VPS:** 8 GB RAM, 4 vCPU (e.g., Hetzner CX31 ~€10/mo, DigitalOcean 8GB Droplet ~$48/mo)

---

## Troubleshooting

### Embedding server takes too long to start
This only applies if you explicitly enable the embedding profile. First start can take several minutes.

```bash
docker compose logs -f embedding
```

### Backend reports `embedding: error` in /health
Embedding model is still warming up. Wait 30 seconds and retry.

### PostgreSQL connection refused
Check the `POSTGRES_PASSWORD` env var matches between `backend` and `postgres` services.

### n8n can't connect to PostgreSQL
Ensure `DB_POSTGRESDB_PASSWORD` env var is set in Dokploy and matches `POSTGRES_PASSWORD`.

---

## MCP Integration with Claude Code

After deployment, update `.mcp.json` in your local project to point to your deployed backend:

```json
{
  "mcpServers": {
    "ai-dashboard": {
      "command": "node",
      "args": ["backend/mcp/server.js"],
      "env": {
        "BACKEND_URL": "https://api.your-domain.com",
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## VS Code Extension

The extension reads `AI_DASHBOARD_URL` and `AI_DASHBOARD_API_KEY` from VS Code settings:

1. Open VS Code Settings (`Cmd+,`)
2. Search for `AI Dashboard`
3. Set `URL` to `https://api.your-domain.com`
4. Set `API Key` to your key

Or via `settings.json`:
```json
{
  "aiDashboard.apiUrl": "https://api.your-domain.com",
  "aiDashboard.apiKey": "your-api-key"
}
```
