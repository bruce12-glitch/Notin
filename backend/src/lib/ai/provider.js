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
  ASK_SYSTEM,
  askUserPrompt,
  MAX_ASK_QUESTION_CHARS,
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

// ── WP-AI-003b — streaming chat (SSE deltas; the JSON endpoint above is untouched) ─
const MOCK_STREAM_CHUNK_WORDS = 6;

function chunkAnswerForStream(answer) {
  // Deterministic ~6-word groups split on word boundaries. Deltas after the
  // first carry a leading space so plain concatenation of all deltas
  // reproduces `answer` byte-for-byte — that is the keyless stream/JSON
  // parity lock.
  const words = String(answer).split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += MOCK_STREAM_CHUNK_WORDS) {
    const group = words.slice(i, i + MOCK_STREAM_CHUNK_WORDS).join(' ');
    if (i === 0) {
      if (group) chunks.push(group);
    } else {
      chunks.push(` ${group}`);
    }
  }
  return chunks;
}

async function* mockChatDeltas(answer) {
  // No timers, no randomness: just a macrotask handoff between yields so the
  // controller can flush frames without blocking the event loop.
  const chunks = chunkAnswerForStream(answer);
  for (let i = 0; i < chunks.length; i += 1) {
    if (i > 0) await new Promise((resolve) => setImmediate(resolve));
    yield chunks[i];
  }
}

async function* groqChatDeltas(note, question, history, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let reader = null;
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
        stream: true,
        messages: [
          { role: 'system', content: CHAT_SYSTEM },
          ...history,
          { role: 'user', content: chatUserPrompt(note, question) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    if (!response.body) throw new Error('AI_PROVIDER_ERROR');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineAt;
      while ((newlineAt = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineAt).replace(/\r$/, '');
        buffer = buffer.slice(newlineAt + 1);
        if (!line.startsWith('data:')) continue; // comments / event fields
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          finished = true;
          break;
        }
        let delta;
        try {
          delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        } catch {
          continue; // malformed upstream frame — skip it, never abort the stream
        }
        if (typeof delta === 'string' && delta) yield delta;
      }
    }
    // Flush a final upstream line that arrived without a trailing newline.
    const tail = `${buffer}${decoder.decode()}`.replace(/\r$/, '');
    if (!finished && tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload !== '[DONE]') {
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) yield delta;
        } catch {
          // Malformed tail frame — skip.
        }
      }
    }
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Already released — nothing to do.
      }
    }
  }
}

export async function chatWithNoteStream(noteText, question, history = []) {
  // Normalization mirrors chatWithNote exactly: same slices, same history
  // sanitization, same mock computation — only the delivery differs.
  const note = String(noteText ?? '').trim().slice(0, MAX_CHAT_NOTE_CHARS);
  const q = String(question ?? '').trim().slice(0, MAX_CHAT_QUESTION_CHARS);
  const turns = sanitizeChatHistory(history);
  let provider;
  let deltas;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    deltas = groqChatDeltas(note, q, turns, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    deltas = mockChatDeltas(mockChatAnswer(note, q).slice(0, MAX_CHAT_ANSWER_CHARS));
  }

  // One line per streamed request, at stream start — never per delta, and
  // never any prompt/question/answer content.
  console.log(`[AI] chat-stream via ${provider}`);

  async function* boundedStream() {
    let sent = 0;
    try {
      for await (const delta of deltas) {
        if (sent >= MAX_CHAT_ANSWER_CHARS) break;
        const room = MAX_CHAT_ANSWER_CHARS - sent;
        const piece = delta.length > room ? delta.slice(0, room) : delta;
        if (!piece) continue;
        sent += piece.length;
        yield piece;
      }
    } finally {
      // Early consumer exit (client disconnect) must still cancel upstream:
      // returning the inner generator runs its own finally (reader.cancel).
      await deltas.return(undefined);
    }
  }

  return { stream: boundedStream(), provider };
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
  // WP-AI-004b — expand action (deterministic mock)
  if (action === 'expand') {
    return `${sentences[0]} Because it anchors the plan, restate it in your own words, add one concrete detail, and give it an owner and a date.`;
  }
  // WP-AI-008 — grammar + outline (deterministic mocks)
  if (action === 'grammar') {
    const cleaned = String(input)
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/([,.!?;:])(?=[^\s\d])/g, '$1 ')
      .trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (action === 'outline') {
    const lines = [`Overview: ${sentences[0].slice(0, 120).trim()}`];
    for (const sentence of sentences.slice(1, 6)) {
      lines.push(`- ${sentence.slice(0, 110).trim()}`);
    }
    if (lines.length === 1) lines.push('- (add more detail to build out this outline)');
    return lines.join('\n');
  }
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

// ── WP-AI-007 — global "ask my notes": grounded answer over retrieved extracts ─
function mockAskAnswer(extracts, question) {
  const lowerQuestion = String(question).toLowerCase();
  const keywords = (lowerQuestion.match(/[a-z][a-z0-9'-]{2,}/g) || [])
    .filter((word) => !CHAT_STOPWORDS.has(word));
  for (const extract of extracts) {
    const sentences = (String(extract.text).match(/[^.!?]+[.!?]+/g) || [])
      .map((s) => s.trim())
      .filter(Boolean);
    const hit = sentences.find((sentence) => {
      const lower = sentence.toLowerCase();
      return keywords.some((word) => lower.includes(word));
    });
    if (hit) return `${hit} [${extract.index}]`;
  }
  const first = extracts[0];
  if (first) return `Closest match — "${first.title}": ${String(first.text).slice(0, 180).trim()} [${first.index}]`;
  return 'I could not find anything about that in your notes.';
}

async function askWithGroq(extracts, question, apiKey) {
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
        max_tokens: 500,
        messages: [
          { role: 'system', content: ASK_SYSTEM },
          { role: 'user', content: askUserPrompt(extracts, question) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI_PROVIDER_ERROR');
    return answer.slice(0, MAX_CHAT_ANSWER_CHARS * 2);
  } catch (error) {
    if (error?.message === 'AI_PROVIDER_ERROR') throw error;
    throw new Error('AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

// extracts: [{ index, title, text }] — retrieval + ranking happen in the controller.
export async function askAcrossNotes(extracts, question) {
  const q = String(question ?? '').trim().slice(0, MAX_ASK_QUESTION_CHARS);
  let provider;
  let answer;

  if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    answer = await askWithGroq(extracts, q, process.env.GROQ_API_KEY);
  } else {
    provider = 'mock';
    answer = mockAskAnswer(extracts, q);
  }

  console.log(`[AI] ask via ${provider} over ${extracts.length} extract(s)`);
  return { answer, provider };
}

// ── WP-AI-009 — audio transcription (Groq Whisper when configured, mock otherwise) ─
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_TRANSCRIBE_MODEL = 'whisper-large-v3';
const MAX_TRANSCRIPT_CHARS = 24000;

function mockTranscript(durationHintSec) {
  const seconds = Number.isFinite(durationHintSec) ? Math.max(1, Math.round(durationHintSec)) : 30;
  return `[Mock transcription — configure GROQ_API_KEY for real Whisper transcription.]\n` +
    `Recording received (${seconds}s of audio). In production this line would be the full ` +
    `transcript of your lecture or meeting, followed by suggested action items.`;
}

export async function transcribeAudio({ buffer, mime, filename, durationHintSec }) {
  if (process.env.GROQ_API_KEY) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), filename || 'recording.webm');
      form.append('model', GROQ_TRANSCRIBE_MODEL);
      form.append('response_format', 'text');
      const response = await fetch(GROQ_TRANSCRIBE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
      const text = (await response.text()).trim();
      if (!text) throw new Error('AI_PROVIDER_ERROR');
      console.log(`[AI] transcribe via groq (${Math.round(buffer.length / 1024)}KB)`);
      return { transcript: text.slice(0, MAX_TRANSCRIPT_CHARS), provider: 'groq' };
    } catch (error) {
      if (error?.message === 'AI_PROVIDER_ERROR') throw error;
      throw new Error('AI_PROVIDER_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
  console.log('[AI] transcribe via mock');
  return { transcript: mockTranscript(durationHintSec), provider: 'mock' };
}
