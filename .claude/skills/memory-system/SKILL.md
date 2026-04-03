---
name: memory-system
description: Persistent memory patterns for coding agents. Use to maintain context across sessions, store important decisions, and retrieve past work. Based on claude-mem memory compression techniques.
---

# Memory System — Persistent Session Context

## Overview

This skill provides patterns for maintaining context across coding sessions, storing decisions, and retrieving relevant past work. It prevents repeatedly solving the same problems and maintains continuity between long development sessions.

Source: https://github.com/thedotmack/claude-mem (v10.6.3)

---

## Core Memory Principles

### What to Remember
- Architecture decisions and why they were made
- Patterns that work vs. patterns that failed for this project
- Environment-specific quirks (deployment config, package versions, known issues)
- Integration credentials format (never values, just the format/location)
- Test commands, build commands, frequently used scripts
- Team conventions and code style preferences

### What NOT to Remember
- Sensitive data (use `<private>` tags to exclude from memory)
- Temporary debugging steps
- Ephemeral state that will change

---

## Memory Storage Patterns

### Session Start — Recall Context
At the start of a coding session, check for existing memory:
1. Review recent decisions in the project's memory files
2. Identify what was in-progress last session
3. Check for known blockers or issues noted previously

### Session End — Capture Context
Before ending a session, record:
- What was accomplished
- What was left incomplete (and why)
- Any new patterns or conventions discovered
- Decisions made and their rationale

### The `<private>` Tag Pattern
Wrap sensitive information to exclude it from memory capture:
```
<private>
  API key format: SUPABASE_KEY=eyJ... (check .env file)
  Database password: stored in .env only
</private>
```

---

## Memory File Organization

Store memory in the project under `docs/` or `.claude/memory/`:

```
.claude/memory/
  decisions.md      — Architecture decisions with dates and rationale
  patterns.md       — Code patterns that work well for this project
  known-issues.md   — Known bugs, quirks, workarounds
  commands.md       — Frequently used commands (test, build, deploy)
  context.md        — Current work state, in-progress features
```

### Decision Log Format
```markdown
## YYYY-MM-DD: [Decision Title]
**Decision:** What was decided
**Why:** Rationale and alternatives considered
**Impact:** What this affects
**Revisit:** Conditions that would change this decision
```

### In-Progress State Format
```markdown
## Current Work State (updated: YYYY-MM-DD)
**Working on:** [Feature/task name]
**Status:** [% complete, current step]
**Next action:** [Exactly what to do next session]
**Blockers:** [What's blocking, if anything]
**Files modified:** [List of files changed so far]
```

---

## Context Injection Pattern

At the start of any complex task, inject relevant context:
```
[MEMORY CONTEXT]
- Last session: implemented X, stopped at Y
- Known issue: Z fails when [condition] — workaround: [approach]
- Decision: using Supabase for storage (see decisions.md for rationale)
- Test command: cd agent && pytest tests/ -v
```

---

## 3-Layer Memory Search Workflow

When searching for past context (inspired by claude-mem MCP tools):

**Layer 1 — Keyword Search:** Search memory files for exact terms (function names, feature names, error messages)

**Layer 2 — Timeline Review:** Review decision log chronologically to understand progression

**Layer 3 — Deep Observation:** Read full context around the match to understand the surrounding situation

This 3-layer approach is ~10x more token-efficient than re-reading entire codebases.

---

## Memory Anti-Patterns

| Anti-Pattern | Better Approach |
|-------------|----------------|
| Solving the same bug twice | Document workarounds in `known-issues.md` |
| Forgetting why a choice was made | Write decisions.md entry at decision time |
| Starting fresh each session | Read `context.md` at session start |
| Storing secrets in memory | Use `<private>` tags; store only location of secrets |
| Memory files growing without structure | Prune outdated entries regularly |

---

## Practical Memory Commands (This Project)

Quick reference for the Aixclerate Voice AI project:

```bash
# Python agent
cd agent && python -m pytest tests/ -v

# Dashboard
cd dashboard && npm run dev
cd dashboard && npm run build

# Deploy (push to GitHub, Dokploy auto-deploys)
git add -A && git commit -m "description" && git push origin main

# Apply DB migrations
python3 scripts/apply_migration.py

# Check agent logs
tail -f /tmp/agent.log
```

**Known project conventions:**
- Agent config loaded from Supabase `agents` table — fresh per call
- Dashboard at `app.aixclerate.cloud`, agent API at `api.aixclerate.cloud`
- Recording pipeline: LiveKit egress → shared volume → Supabase Storage REST upload
- Language presets in `agent/agent.py::LANGUAGE_PRESETS`
- Feature toggles per-agent in DB (`tools_enabled`, `end_call_enabled`, etc.)
