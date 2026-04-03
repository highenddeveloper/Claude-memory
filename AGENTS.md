# AGENTS.md — Agent Definitions & Orchestration

## Agent Architecture

This platform uses a **single orchestrator** pattern. One agent engine handles all tasks, delegating to specialized service modules. No multi-agent framework overhead — just clean async orchestration.

```
┌─────────────────────────────────────────────┐
│              Agent Engine                     │
│                                               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Planner │→ │ Executor │→ │ Summarizer │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│       ↑              │              │         │
│       │         ┌────▼────┐         │         │
│       │         │  Steps  │         │         │
│       │         │ Queue   │         │         │
│       │         └────┬────┘         │         │
│       └──────────────┘              │         │
│                                     ↓         │
│                              ┌──────────┐     │
│                              │  Memory  │     │
│                              └──────────┘     │
└─────────────────────────────────────────────┘
```

---

## Agent Types

### 1. Research Agent
**Purpose:** Deep web research on a topic
**Steps:**
1. Parse intent → extract keywords
2. Check memory for prior research on this topic
3. Search (SearXNG) → get top 10 results
4. Browse top 3-5 URLs (Browserless, parallel)
5. Extract and clean content
6. Summarize findings
7. Store in long-term memory (PostgreSQL + Qdrant vectors)
8. Cache result (Valkey, 24h TTL)

**Config:**
```json
{
  "type": "research",
  "maxSteps": 8,
  "timeout": 300000,
  "parallelBrowse": 3,
  "cacheTTL": 86400
}
```

### 2. Monitor Agent
**Purpose:** Track changes on specific URLs or topics
**Steps:**
1. Load previous snapshot from memory
2. Browse current page (Browserless)
3. Diff against snapshot
4. If changed → summarize delta
5. Store new snapshot
6. Optionally trigger n8n webhook

**Config:**
```json
{
  "type": "monitor",
  "maxSteps": 6,
  "timeout": 120000,
  "cacheTTL": 3600
}
```

### 3. Automation Agent
**Purpose:** Trigger and chain n8n workflows
**Steps:**
1. Validate workflow ID exists
2. Prepare payload from context
3. Trigger n8n webhook
4. Poll for completion
5. Return result

**Config:**
```json
{
  "type": "automation",
  "maxSteps": 5,
  "timeout": 180000,
  "cacheTTL": 0
}
```

### 4. Memory Agent
**Purpose:** Manage knowledge retrieval and storage
**Steps:**
1. Parse query intent (store vs recall)
2. If recall: vector search Qdrant → fetch full docs from PostgreSQL
3. If store: embed text → upsert Qdrant + insert PostgreSQL
4. Return structured result

**Config:**
```json
{
  "type": "memory",
  "maxSteps": 4,
  "timeout": 30000,
  "cacheTTL": 0
}
```

---

## Agent Execution Model

### Task Lifecycle
```
PENDING → PLANNING → EXECUTING → SUMMARIZING → COMPLETED
                         ↓
                       FAILED (with retry info)
```

### Task Schema (PostgreSQL)
```sql
CREATE TABLE agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(50) NOT NULL,
  input         JSONB NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  steps         JSONB DEFAULT '[]',
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_tasks_status ON agent_tasks(status);
CREATE INDEX idx_tasks_type ON agent_tasks(type);
```

### Step Schema (embedded in task.steps JSONB)
```json
{
  "stepId": 1,
  "action": "search",
  "input": { "query": "..." },
  "output": { "results": [...] },
  "status": "completed",
  "duration_ms": 1234,
  "cached": false,
  "timestamp": "2026-04-03T..."
}
```

---

## Memory Architecture

### Short-Term Memory (Valkey)
- **Scope:** Current agent execution context
- **TTL:** Duration of task + 1 hour
- **Key format:** `agent:{taskId}:context`
- **Use:** Pass context between steps without re-querying

### Long-Term Memory (PostgreSQL + Qdrant)
- **PostgreSQL:** Stores full text content, metadata, relationships
- **Qdrant:** Stores vector embeddings for semantic search
- **Linked by:** `memory_id` (UUID)

```sql
CREATE TABLE memory_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  summary     TEXT,
  metadata    JSONB DEFAULT '{}',
  source_url  TEXT,
  agent_task  UUID REFERENCES agent_tasks(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_metadata ON memory_entries USING GIN(metadata);
```

### Embedding Strategy
- Use a local embedding model or API-compatible service (no paid APIs)
- For v1: use `sentence-transformers/all-MiniLM-L6-v2` via a lightweight Python sidecar or ONNX runtime
- Store 384-dimension vectors in Qdrant
- Batch embed on store, single-vector query on recall

---

## Orchestration Rules

1. **Max concurrency:** 3 agent tasks running simultaneously
2. **Step timeout:** Individual step max 60 seconds
3. **Task timeout:** Configurable per agent type (default 5 min)
4. **Retry policy:** Failed steps retry once with exponential backoff
5. **Circuit breaker:** If a service fails 3x in 5 min, skip it and mark step as degraded
6. **Priority queue:** Tasks execute FIFO, no priority lanes in v1

---

## MCP ↔ Agent Integration

Claude Code interacts with agents through MCP tools:

```
Claude → MCP tool "run_agent" → Backend POST /agent/run → Agent Engine
Claude → MCP tool "agent_status" → Backend GET /agent/status/:id → Task DB
```

The MCP server is **thin** — it's just a bridge between Claude's stdio protocol and the HTTP backend. All logic lives in the backend.

### Tool Definitions for Claude

```javascript
// MCP tool: run_agent
{
  name: "run_agent",
  description: "Execute an autonomous agent task. Types: research, monitor, automation, memory",
  inputSchema: {
    type: { type: "string", enum: ["research", "monitor", "automation", "memory"] },
    input: { type: "string", description: "The task description or query" },
    options: { type: "object", description: "Optional overrides (timeout, maxSteps)" }
  }
}

// MCP tool: agent_status
{
  name: "agent_status",
  description: "Check the status of a running agent task",
  inputSchema: {
    taskId: { type: "string", description: "UUID of the agent task" }
  }
}
```

---

## Service Dependencies Per Agent Type

| Agent Type | SearXNG | Browserless | PostgreSQL | Valkey | Qdrant | n8n |
|------------|---------|-------------|------------|--------|--------|-----|
| Research   | ✅      | ✅          | ✅         | ✅     | ✅     | ❌  |
| Monitor    | ❌      | ✅          | ✅         | ✅     | ❌     | ✅  |
| Automation | ❌      | ❌          | ✅         | ❌     | ❌     | ✅  |
| Memory     | ❌      | ❌          | ✅         | ✅     | ✅     | ❌  |

---

## Future: Multi-Agent Coordination

v2 roadmap (not in current scope):
- **Agent-to-agent messaging** via Valkey pub/sub
- **Supervisor agent** that spawns and monitors child agents
- **Shared blackboard** (PostgreSQL table) for inter-agent state
- **Conflict resolution** when multiple agents write to same memory

Keep the current single-orchestrator clean — it's the right foundation for multi-agent later.
