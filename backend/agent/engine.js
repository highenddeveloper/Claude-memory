import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import config from '../config.js';
import { query } from '../services/postgres.js';
import { cacheGet, cacheSet } from '../services/valkey.js';
import { search } from '../services/searxng.js';
import { browse, browseParallel } from '../services/browserless.js';
import { triggerWebhook } from '../services/n8n.js';
import { embedSingle } from '../services/embedding.js';
import { summarizeResearch, answer, isLLMConfigured } from '../services/llm.js';

const logger = pino({ level: config.logLevel });

const AGENT_CONFIGS = {
  research: { maxSteps: 8, timeout: 300000 },
  monitor: { maxSteps: 6, timeout: 120000 },
  automation: { maxSteps: 5, timeout: 180000 },
  memory: { maxSteps: 4, timeout: 30000 },
  chat: { maxSteps: 3, timeout: 60000 },
};

// ─── Concurrency: DB-based, survives restarts ───

async function getRunningCount() {
  const result = await query(
    `SELECT COUNT(*) AS cnt FROM agent_tasks WHERE status IN ('planning', 'executing')`
  );
  return parseInt(result.rows[0].cnt, 10);
}

// ─── Retry helper with exponential backoff ───

async function withRetry(fn, { maxRetries = 1, baseDelayMs = 1000, label = 'step' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn({ label, attempt, delay, err: err.message }, 'Retrying step');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Score a result for relevance/quality ───

function scoreResult(stepOutput) {
  if (!stepOutput) return 0;
  let score = 0;
  // Research results scoring
  if (stepOutput.results?.length) score += Math.min(stepOutput.results.length * 10, 100);
  if (stepOutput.infoboxes?.length) score += 20;
  // Browse results scoring
  if (stepOutput.text?.length > 100) score += 30;
  if (stepOutput.text?.length > 1000) score += 20;
  // Memory results scoring
  if (stepOutput.entries?.length) score += stepOutput.count * 15;
  if (stepOutput.memoryId) score += 10;
  // Pages (browse parallel)
  if (stepOutput.pages?.length) {
    const successes = stepOutput.pages.filter((p) => p.success).length;
    score += successes * 25;
  }
  return Math.min(score, 100);
}

// ─── Public API ───

export async function runAgent(type, input, options = {}) {
  const running = await getRunningCount();
  if (running >= config.agent.maxConcurrency) {
    throw Object.assign(new Error('Max concurrent agents reached. Try again shortly.'), { status: 429 });
  }

  const taskId = uuidv4();
  const agentConfig = { ...AGENT_CONFIGS[type], ...options };

  await query(
    `INSERT INTO agent_tasks (id, type, input, status)
     VALUES ($1, $2, $3, 'pending')`,
    [taskId, type, JSON.stringify({ text: input })]
  );

  // Fire and forget — caller polls via getTaskStatus
  executeAgent(taskId, type, input, agentConfig).catch((err) => {
    logger.error({ taskId, err: err.message }, 'Agent execution failed');
  });

  return { taskId, type, status: 'pending' };
}

// ─── Core execution loop ───

async function executeAgent(taskId, type, input, agentConfig) {
  const steps = [];
  const startTime = Date.now();

  try {
    await updateTask(taskId, 'planning', steps);

    const timeoutMs = agentConfig.timeout || config.agent.timeoutMs;
    const deadline = startTime + timeoutMs;

    await updateTask(taskId, 'executing', steps);

    const executors = {
      research: executeResearch,
      monitor: executeMonitor,
      automation: executeAutomation,
      memory: executeMemoryAgent,
      chat: executeChatAgent,
    };

    const executor = executors[type];
    if (!executor) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    await executor(taskId, input, steps, deadline, agentConfig);

    // Compute overall quality score
    const totalScore = steps.reduce((sum, s) => sum + (s.score || 0), 0);
    const avgScore = steps.length ? Math.round(totalScore / steps.length) : 0;

    const finalResult = {
      summary: steps.filter((s) => s.status === 'completed').map((s) => s.output),
      totalSteps: steps.length,
      completedSteps: steps.filter((s) => s.status === 'completed').length,
      failedSteps: steps.filter((s) => s.status === 'failed').length,
      skippedSteps: steps.filter((s) => s.status === 'skipped').length,
      qualityScore: avgScore,
      durationMs: Date.now() - startTime,
    };

    await updateTask(taskId, 'completed', steps, finalResult);
  } catch (err) {
    await updateTask(taskId, 'failed', steps, null, err.message);
  }
}

// ─── Check deadline helper ───

function pastDeadline(deadline) {
  return Date.now() > deadline;
}

// ─── Research Agent: search → browse → store ───

async function executeResearch(taskId, input, steps, deadline, agentConfig) {
  // Step 1: Search (with retry)
  const searchOutput = await runStep(steps, 'search', { query: input }, deadline, async () => {
    return withRetry(
      () => search(input, { maxResults: 10 }),
      { maxRetries: config.agent.maxRetries, label: 'search' }
    );
  });

  if (pastDeadline(deadline) || !searchOutput) return;

  // Early stopping: no results means nothing to browse
  if (!searchOutput.results?.length) {
    steps.push({
      stepId: steps.length + 1,
      action: 'early_stop',
      input: { reason: 'No search results found' },
      output: null,
      status: 'skipped',
      score: 0,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Step 2: Browse top results in parallel (with retry per URL)
  const urls = searchOutput.results.slice(0, 3).map((r) => r.url);
  const browseOutput = await runStep(steps, 'browse', { urls }, deadline, async () => {
    if (urls.length === 0) return { pages: [] };
    return { pages: await browseParallel(urls, { maxLength: 20000 }) };
  });

  if (pastDeadline(deadline)) return;

  // Step 3: Store results in long-term memory
  const summaryText = steps
    .filter((s) => s.status === 'completed' && s.output)
    .map((s) => JSON.stringify(s.output))
    .join('\n')
    .slice(0, 50000);

  await runStep(steps, 'store_memory', { content: summaryText }, deadline, async () => {
    return withRetry(
      async () => {
        const result = await query(
          `INSERT INTO memory_entries (content, summary, metadata, source_url)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [summaryText, `Research: ${input}`, { agentTask: taskId, type: 'research' }, urls[0] || null]
        );
        const memoryId = result.rows[0].id;

        // Best-effort: embed and store vector in Qdrant for semantic recall
        try {
          const vector = await embedSingle(summaryText.slice(0, 8000));
          if (vector) {
            await fetch(`${config.qdrant.url}/collections/${config.qdrant.collectionName}/points`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: [{ id: memoryId, vector, payload: { type: 'research', task: taskId } }],
              }),
              signal: AbortSignal.timeout(5000),
            });
          }
        } catch { /* vector store is best-effort */ }

        return { memoryId };
      },
      { maxRetries: config.agent.maxRetries, label: 'store_memory' }
    );
  });

  if (pastDeadline(deadline)) return;

  // Step 4: LLM summarization (best-effort, only if Groq is configured)
  if (isLLMConfigured()) {
    const browseText = (browseOutput?.pages || [])
      .filter((p) => p.success && p.text)
      .map((p) => p.text)
      .join('\n\n')
      .slice(0, 15000);

    if (browseText) {
      await runStep(steps, 'summarize', { topic: input }, deadline, async () => {
        const summary = await summarizeResearch(browseText, input);
        return summary ? { summary, model: config.llm.model } : { note: 'LLM summarization skipped' };
      });
    }
  }
}

// ─── Monitor Agent: browse → diff → store snapshot ───

async function executeMonitor(taskId, input, steps, deadline) {
  // Step 1: Browse the URL (no cache — we want fresh content)
  const browseOutput = await runStep(steps, 'browse', { url: input }, deadline, async () => {
    return withRetry(
      () => browse(input, { noCache: true }),
      { maxRetries: config.agent.maxRetries, label: 'browse' }
    );
  });

  if (pastDeadline(deadline) || !browseOutput) return;

  // Step 2: Load previous snapshot for comparison
  const previousSnapshot = await runStep(steps, 'load_previous', { url: input }, deadline, async () => {
    const prev = await query(
      `SELECT content, created_at FROM memory_entries
       WHERE source_url = $1 AND metadata->>'type' = 'monitor'
       ORDER BY created_at DESC LIMIT 1`,
      [input]
    );
    return {
      hasPrevious: prev.rows.length > 0,
      previousContent: prev.rows[0]?.content || null,
      previousDate: prev.rows[0]?.created_at || null,
    };
  });

  if (pastDeadline(deadline)) return;

  // Step 3: Diff and store new snapshot
  const content = browseOutput.text || '';
  const changed = previousSnapshot?.previousContent !== content;

  await runStep(steps, 'store_snapshot', { url: input, changed }, deadline, async () => {
    const result = await query(
      `INSERT INTO memory_entries (content, summary, metadata, source_url)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        content,
        `Monitor snapshot: ${input}`,
        { agentTask: taskId, type: 'monitor', changed, previousDate: previousSnapshot?.previousDate },
        input,
      ]
    );
    return { memoryId: result.rows[0].id, changed };
  });
}

// ─── Automation Agent: trigger n8n webhook ───

async function executeAutomation(taskId, input, steps, deadline) {
  // Parse input as "webhook:payload" format
  const colonIdx = input.indexOf(':');
  const webhook = colonIdx > 0 ? input.slice(0, colonIdx) : input;
  const payloadStr = colonIdx > 0 ? input.slice(colonIdx + 1) : '{}';

  await runStep(steps, 'trigger_webhook', { webhook }, deadline, async () => {
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      payload = { input: payloadStr };
    }
    return withRetry(
      () => triggerWebhook(webhook, { ...payload, agentTask: taskId }),
      { maxRetries: config.agent.maxRetries, label: 'trigger_webhook' }
    );
  });
}

// ─── Memory Agent: FTS + vector semantic search ───

async function executeMemoryAgent(taskId, input, steps, deadline) {
  // Step 1: Full-text search (keyword match)
  const ftsResult = await runStep(steps, 'recall_fts', { query: input }, deadline, async () => {
    const result = await query(
      `SELECT id, content, summary, metadata, source_url, created_at,
             ts_rank(to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, '')),
                     websearch_to_tsquery('english', $1)) AS rank
       FROM memory_entries
       WHERE to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, ''))
             @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC LIMIT 10`,
      [input]
    );
    return { entries: result.rows, count: result.rows.length };
  });

  if (pastDeadline(deadline)) return;

  // Step 2: Vector semantic search via Rust embedding server + Qdrant
  await runStep(steps, 'recall_vector', { query: input }, deadline, async () => {
    const vector = await embedSingle(input);
    if (!vector) return { entries: [], count: 0, note: 'Embedding service unavailable' };

    const qdrantRes = await fetch(
      `${config.qdrant.url}/collections/${config.qdrant.collectionName}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector, limit: 10, with_payload: true }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!qdrantRes.ok) return { entries: [], count: 0, note: 'Qdrant search failed' };

    const data = await qdrantRes.json();
    const ids = (data.result || []).map((r) => r.id);
    if (!ids.length) return { entries: [], count: 0 };

    const pgResult = await query(
      `SELECT id, content, summary, metadata, source_url, created_at
       FROM memory_entries WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    const scoreMap = new Map((data.result || []).map((r) => [r.id, r.score]));
    const entries = pgResult.rows
      .map((r) => ({ ...r, similarity: scoreMap.get(r.id) || 0 }))
      .sort((a, b) => b.similarity - a.similarity);

    return { entries, count: entries.length };
  });
}

// ─── Chat Agent: direct LLM answer with optional memory context ───

async function executeChatAgent(taskId, input, steps, deadline) {
  // Step 1: Recall relevant memory for context
  let context = '';
  const memStep = await runStep(steps, 'recall_context', { query: input }, deadline, async () => {
    const result = await query(
      `SELECT content, summary FROM memory_entries
       WHERE to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, ''))
             @@ websearch_to_tsquery('english', $1)
       ORDER BY created_at DESC LIMIT 3`,
      [input]
    );
    return { entries: result.rows, count: result.rows.length };
  });

  if (memStep?.entries?.length) {
    context = memStep.entries.map((e) => e.summary || e.content).join('\n\n');
  }

  // Step 2: Answer with Groq (required for chat type)
  await runStep(steps, 'llm_answer', { question: input }, deadline, async () => {
    if (!isLLMConfigured()) {
      throw new Error('GROQ_API_KEY not configured. Set it in your environment variables.');
    }
    const response = await answer(input, context);
    if (!response) throw new Error('LLM returned empty response');
    return { answer: response, model: config.llm.model, hadContext: Boolean(context) };
  });
}

// ─── Step runner with deadline check, scoring, and graceful degradation ───

async function runStep(steps, action, input, deadline, fn) {
  const stepId = steps.length + 1;

  // Check deadline before even starting
  if (pastDeadline(deadline)) {
    steps.push({
      stepId, action, input,
      output: null,
      status: 'skipped',
      score: 0,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  const start = Date.now();

  // Per-step timeout: use remaining time or step timeout, whichever is shorter
  const remaining = deadline - Date.now();
  const stepTimeout = Math.min(remaining, config.agent.stepTimeoutMs);

  try {
    const output = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Step timeout exceeded')), stepTimeout)
      ),
    ]);

    const score = scoreResult(output);
    const step = {
      stepId, action, input, output,
      status: 'completed',
      score,
      duration_ms: Date.now() - start,
      cached: output?.cached || false,
      timestamp: new Date().toISOString(),
    };
    steps.push(step);
    return output;
  } catch (err) {
    logger.warn({ action, stepId, err: err.message }, 'Step failed (degraded)');
    steps.push({
      stepId, action, input,
      output: null,
      status: 'failed',
      score: 0,
      error: err.message,
      duration_ms: Date.now() - start,
      cached: false,
      timestamp: new Date().toISOString(),
    });
    // Graceful degradation: return null instead of throwing so the agent continues
    return null;
  }
}

// ─── Task DB helpers ───

async function updateTask(taskId, status, steps, result = null, error = null) {
  const completedAt = (status === 'completed' || status === 'failed') ? new Date() : null;
  await query(
    `UPDATE agent_tasks
     SET status = $1, steps = $2, result = $3, error = $4,
         updated_at = NOW(), completed_at = $5
     WHERE id = $6`,
    [status, JSON.stringify(steps), result ? JSON.stringify(result) : null, error, completedAt, taskId]
  );
}

export async function getTaskStatus(taskId) {
  const result = await query('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  return result.rows[0] || null;
}

export async function listTasks(limit = 20) {
  const result = await query(
    'SELECT id, type, status, created_at, completed_at FROM agent_tasks ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}
