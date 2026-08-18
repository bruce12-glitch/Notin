import {
  MAX_INPUT_CHARS,
  SUMMARIZE_SYSTEM,
  summarizeUserPrompt,
  TITLE_SYSTEM,
  titleUserPrompt,
  MAX_TITLE_INPUT_CHARS,
  MAX_TITLE_LEN,
  TAGS_SYSTEM,
  tagsUserPrompt,
  MAX_TAGS_INPUT_CHARS,
  MAX_TAGS_COUNT,
  MAX_TAG_LEN,
  CHAT_SYSTEM,
  chatUserPrompt,
  MAX_CHAT_NOTE_CHARS,
  MAX_CHAT_QUESTION_CHARS,
  MAX_CHAT_ANSWER_CHARS,
  MAX_CHAT_HISTORY,
  ASSIST_SYSTEM,
  assistUserPrompt,
  MAX_ASSIST_CONTEXT_CHARS,
  MAX_ASSIST_INPUT_CHARS,
  MAX_ASSIST_OUTPUT_CHARS,
} from './prompts.js';

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

// ── WP-AI-002b — smart tag suggestions ──────────────────────────────────────
function normalizeTags(items) {
  const tags = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== 'string') continue;
    const tag = item
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_TAG_LEN)
      .trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === MAX_TAGS_COUNT) break;
  }
  return tags;
}

function parseTagResponse(raw) {
  const content = String(raw ?? '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const arrayBlock = content.match(/\[[\s\S]*?\]/)?.[0];
  let candidates = [];
  if (arrayBlock) {
    try {
      const parsed = JSON.parse(arrayBlock);
      if (Array.isArray(parsed)) candidates = parsed;
    } catch {
      // Fall through to quoted-string recovery below.
    }
  }
  if (!candidates.length) {
    candidates = [...content.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  }
  return normalizeTags(candidates);
}

function mockTags(text) {
  const matches = String(text).toLowerCase().match(/[a-z][a-z0-9-]{3,15}/gi) || [];
  const tags = [];
  const seen = new Set();
  for (const word of matches) {
    if (seen.has(word)) continue;
    seen.add(word);
    tags.push(word.slice(0, MAX_TAG_LEN));
    if (tags.length === 3) break;
  }
  for (const fallback of ['notes', 'ideas', 'draft']) {
    if (tags.length >= 3) break;
    if (seen.has(fallback)) continue;
    seen.add(fallback);
    tags.push(fallback);
  }
  return tags.slice(0, MAX_TAGS_COUNT);
}

async function tagsWithGroq(text, existingTags, apiKey) {
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
        max_tokens: 120,
        messages: [
          { role: 'system', content: TAGS_SYSTEM },
          { role: 'user', content: tagsUserPrompt(text, existingTags) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const tags = parseTagResponse(payload?.choices?.[0]?.message?.content);
    if (!tags.length) throw new Error('AI_PROVIDER_ERROR');
    return tags;
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestTags(text, existingTags = []) {
  const normalized = String(text ?? '').trim().slice(0, MAX_TAGS_INPUT_CHARS);
  let provider;
  let tags;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    tags = await tagsWithGroq(normalized, existingTags, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    tags = mockTags(normalized);
  }

  console.log(`[AI] tags via ${provider}`);
  return { tags, provider };
}

// ── WP-AI-003 — chat with note (non-streaming; server never persists anything) ─
const CHAT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'what', 'when', 'where', 'who',
  'how', 'does', 'did', 'can', 'you',
]);

function sanitizeChatHistory(history) {
  const messages = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'user' || item.role === 'assistant' ? item.role : null;
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, 500) : '';
    if (!role || !content) continue;
    messages.push({ role, content });
  }
  return messages.slice(-MAX_CHAT_HISTORY);
}

function mockChatAnswer(noteText, question) {
  const lowerQuestion = String(question).toLowerCase();
  const keywords = (lowerQuestion.match(/[a-z][a-z0-9'-]{2,}/g) || [])
    .filter((word) => !CHAT_STOPWORDS.has(word));
  const sentences = (String(noteText).match(/[^.!?]+[.!?]+/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return 'I cannot find that in this note.';
  const match = sentences.find((sentence) => {
    const lowerSentence = sentence.toLowerCase();
    return keywords.some((word) => lowerSentence.includes(word));
  });
  const sentence = match || sentences[0];
  return `Based on the note: ${sentence}`.slice(0, MAX_CHAT_ANSWER_CHARS);
}

async function chatWithGroq(noteText, question, history, apiKey) {
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
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: CHAT_SYSTEM },
          ...history,
          { role: 'user', content: chatUserPrompt(noteText, question) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI_PROVIDER_ERROR');
    return answer.slice(0, MAX_CHAT_ANSWER_CHARS);
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatWithNote(noteText, question, history = []) {
  const note = String(noteText ?? '').trim().slice(0, MAX_CHAT_NOTE_CHARS);
  const q = String(question ?? '').trim().slice(0, MAX_CHAT_QUESTION_CHARS);
  const turns = sanitizeChatHistory(history);
  let provider;
  let answer;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    answer = await chatWithGroq(note, q, turns, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    answer = mockChatAnswer(note, q).slice(0, MAX_CHAT_ANSWER_CHARS);
  }

  console.log(`[AI] chat via ${provider}`);
  return { answer, provider };
}

// ── WP-AI-004 — writing assistant (suggestion only; never writes the note) ──
function assistSentences(input) {
  const sentences = (String(input).match(/[^.!?]+[.!?]+/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return sentences.length ? sentences : [String(input).replace(/\s+/g, ' ').trim()];
}

function mockAssist(action, input) {
  const sentences = assistSentences(input);
  if (action === 'continue') {
    const tail = sentences.at(-1).slice(0, 80).trim();
    return `Next step: revisit "${tail}" and turn it into one concrete, dated action.`;
  }
  if (action === 'rephrase') return [...sentences].reverse().join(' ');
  const normalized = String(input).replace(/\s+/g, ' ').trim();
  const maxLength = Math.max(1, Math.floor(normalized.length / 2));
  return sentences[0].slice(0, maxLength).trim();
}

async function assistWithGroq(action, input, apiKey) {
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
        temperature: action === 'continue' ? 0.4 : 0.2,
        max_tokens: 300,
        messages: [
          { role: 'system', content: ASSIST_SYSTEM[action] },
          { role: 'user', content: assistUserPrompt(action, input) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const suggestion = payload?.choices?.[0]?.message?.content?.trim();
    if (!suggestion) throw new Error('AI_PROVIDER_ERROR');
    return suggestion.slice(0, MAX_ASSIST_OUTPUT_CHARS);
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function assistWrite(action, text) {
  const maxChars = action === 'continue' ? MAX_ASSIST_CONTEXT_CHARS : MAX_ASSIST_INPUT_CHARS;
  const input = String(text ?? '').trim().slice(0, maxChars);
  let provider;
  let suggestion;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    suggestion = await assistWithGroq(action, input, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    suggestion = mockAssist(action, input).slice(0, MAX_ASSIST_OUTPUT_CHARS);
  }

  console.log(`[AI] assist via ${provider}`);
  return { suggestion, provider };
}
