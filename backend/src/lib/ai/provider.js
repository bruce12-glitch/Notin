import { MAX_INPUT_CHARS, SUMMARIZE_SYSTEM, summarizeUserPrompt } from './prompts.js';

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
