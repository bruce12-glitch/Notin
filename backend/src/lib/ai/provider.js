import { MAX_INPUT_CHARS, SUMMARIZE_SYSTEM, summarizeUserPrompt, TITLE_SYSTEM, titleUserPrompt, MAX_TITLE_INPUT_CHARS, MAX_TITLE_LEN } from './prompts.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const REQUEST_TIMEOUT_MS = 20_000;

function mockSummary(text) {
  const matches = text.match(/[^.!?]*[.!?]+/g) || [];
  const sentences = matches.map((sentence) => sentence.trim()).filter(Boolean);
  const firstSentences = (sentences.length ? sentences : [text]).slice(0, 3);
  let summary = firstSentences.join(' ');
  if (summary.length < 80) {
    summary += ' This note is still short — keep writing to get richer summaries.';
  }
  return summary.slice(0, 500);
}

async function summarizeWithGroq(text, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SUMMARIZE_SYSTEM },
          { role: 'user', content: summarizeUserPrompt(text) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const summary = payload?.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error('AI_PROVIDER_ERROR');
    return summary;
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeText(text) {
  const normalized = String(text ?? '').trim().slice(0, MAX_INPUT_CHARS);
  let provider;
  let summary;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    summary = await summarizeWithGroq(normalized, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    summary = mockSummary(normalized);
  }

  console.log(`[AI] summarize via ${provider}`);
  return { summary, provider };
}

// ── WP-AI-002 — AI title generation ─────────────────────────────────────────
function cleanTitle(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TITLE_LEN)
    .trim();
}

function mockTitle(text) {
  // Deterministic: first sentence-like segment, cleaned and capped.
  const segment = String(text).split(/(?<=[.!?])\s+|\n/)[0] || '';
  const cleaned = cleanTitle(segment);
  return cleaned.length >= 8 ? cleaned : 'Untitled idea';
}

async function titleWithGroq(text, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        max_tokens: 40,
        messages: [
          { role: 'system', content: TITLE_SYSTEM },
          { role: 'user', content: titleUserPrompt(text) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const title = cleanTitle(payload?.choices?.[0]?.message?.content);
    if (!title) throw new Error('AI_PROVIDER_ERROR');
    return title;
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestTitle(text) {
  const normalized = String(text ?? '').trim().slice(0, MAX_TITLE_INPUT_CHARS);
  let provider;
  let title;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    title = await titleWithGroq(normalized, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    title = mockTitle(normalized);
  }

  console.log(`[AI] title via ${provider}`);
  return { title, provider };
}
