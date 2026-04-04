import Groq from 'groq-sdk';
import pino from 'pino';
import config from '../config.js';

const logger = pino({ level: config.logLevel });

let _client = null;

function getClient() {
  if (!_client) {
    if (!config.llm.groqApiKey) return null;
    _client = new Groq({ apiKey: config.llm.groqApiKey });
  }
  return _client;
}

export function isLLMConfigured() {
  return Boolean(config.llm.groqApiKey);
}

/**
 * Send a chat completion request to Groq.
 * Returns null if no API key is configured.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ model?: string, maxTokens?: number, temperature?: number }} opts
 * @returns {Promise<string|null>}
 */
export async function chat(messages, opts = {}) {
  const client = getClient();
  if (!client) {
    logger.debug('LLM not configured — skipping Groq call');
    return null;
  }

  const model = opts.model || config.llm.model;
  const maxTokens = opts.maxTokens || config.llm.maxTokens;
  const temperature = opts.temperature ?? 0.7;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    return completion.choices[0]?.message?.content || null;
  } catch (err) {
    logger.warn({ model, err: err.message }, 'Groq LLM call failed');
    return null;
  }
}

/**
 * Summarize a block of research text into a concise summary.
 *
 * @param {string} content - Raw concatenated research text
 * @param {string} topic - Original research query
 * @returns {Promise<string|null>}
 */
export async function summarizeResearch(content, topic) {
  return chat([
    {
      role: 'system',
      content:
        'You are a research assistant. Summarize the given content concisely, focusing on key facts and insights relevant to the topic. Be factual and brief.',
    },
    {
      role: 'user',
      content: `Topic: ${topic}\n\nContent:\n${content.slice(0, 12000)}`,
    },
  ], { maxTokens: 512, temperature: 0.3 });
}

/**
 * Answer a question directly using the LLM.
 *
 * @param {string} question
 * @param {string} [context] - Optional context from memory/search
 * @returns {Promise<string|null>}
 */
export async function answer(question, context = '') {
  const messages = [
    {
      role: 'system',
      content:
        'You are a helpful AI assistant. Answer the user\'s question accurately and concisely. If context is provided, use it to improve your answer.',
    },
  ];

  if (context) {
    messages.push({ role: 'user', content: `Context:\n${context.slice(0, 8000)}\n\nQuestion: ${question}` });
  } else {
    messages.push({ role: 'user', content: question });
  }

  return chat(messages, { maxTokens: 1024, temperature: 0.7 });
}

export async function llmHealth() {
  if (!isLLMConfigured()) return { ok: false, configured: false };
  const client = getClient();
  try {
    const models = await client.models.list();
    return { ok: true, configured: true, models: models.data?.length || 0 };
  } catch (err) {
    return { ok: false, configured: true, error: err.message };
  }
}
