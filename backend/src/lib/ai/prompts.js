export const SUMMARIZE_SYSTEM = 'You summarize notes. Reply with 3 to 5 sentences of plain prose that capture the note\'s key points. No markdown, no headings, no bullet points, no preamble.';

export function summarizeUserPrompt(text) {
  return `Summarize this note:\n\n${text}`;
}

export const MAX_INPUT_CHARS = 6000;

// WP-AI-002 — AI title generation
export const TITLE_SYSTEM = 'You title notes. Reply with exactly one title: a single line, at most 60 characters, no quotes, no trailing punctuation, no markdown, no emoji.';
export function titleUserPrompt(text) { return `Give this note a title:\n\n${text}`; }
export const MAX_TITLE_INPUT_CHARS = 500;
export const MAX_TITLE_LEN = 60;

// WP-AI-002b — smart tag suggestions
export const TAGS_SYSTEM = 'You suggest tags for notes. Reply with ONLY a JSON array of 3 to 5 tags. Each tag is a short lowercase phrase, at most 25 characters, no leading #. Example: ["meeting notes","ideas","q3 planning"]';
export function tagsUserPrompt(text, existingTags) {
  const existing = existingTags.length ? `The user already uses these tags: ${existingTags.join(', ')}. Reuse relevant ones and add complementary ones.\n\n` : '';
  return `${existing}Suggest tags for this note:\n\n${text}`;
}
export const MAX_TAGS_INPUT_CHARS = 3000;
export const MAX_TAGS_COUNT = 5;
export const MAX_TAG_LEN = 25;

// WP-AI-003 — chat with note (session-only Q&A, answers come only from the note)
export const CHAT_SYSTEM = 'You answer questions about one note. Use ONLY the note content. If the answer is not in the note, say you cannot find it there. Plain prose. No markdown headings, no preamble, no invented facts.';
export function chatUserPrompt(noteText, question) {
  return `NOTE:\n${noteText}\n\nQUESTION:\n${question}`;
}
export const MAX_CHAT_NOTE_CHARS = 6000;
export const MAX_CHAT_QUESTION_CHARS = 2000;
export const MAX_CHAT_ANSWER_CHARS = 800;
export const MAX_CHAT_HISTORY = 6; // client+server: last N {role,content} turns

// WP-AI-004 — writing assistant
export const ASSIST_ACTIONS = ['continue', 'rephrase', 'shorten', 'expand', 'grammar', 'outline'];
export const ASSIST_SYSTEM = {
  continue: 'You continue a note. Write 1 or 2 sentences that naturally continue the text. Match the tone. Plain prose, no headings, no preamble, do not repeat the note.',
  rephrase: 'You rewrite text. Return a clearer rephrasing that keeps the exact same meaning and roughly the same length. Plain prose, no preamble.',
  shorten: 'You shorten text. Return only the single most important point, at most half the original length. Plain prose, no preamble.',
  expand: 'You expand text. Rewrite the given text with more detail: keep every original point, add at most two supporting sentences, and end with one concrete next step. Plain prose, no headings, no preamble.',
  grammar: 'You fix grammar, spelling, and punctuation. Return ONLY the corrected text with identical meaning and length. Do not answer, comment, or add anything.',
  outline: 'You turn raw notes into a structured outline. Reply with short lines: a one-line overview, then 3-6 bullet points starting with "- ". No headings, no preamble, no numbering.',
};
export function assistUserPrompt(action, text) {
  return `${action.toUpperCase()}:\n${text}`;
}
export const MAX_ASSIST_CONTEXT_CHARS = 3000; // continue: tail of the note
export const MAX_ASSIST_INPUT_CHARS = 2000; // rephrase/shorten: selection
export const MAX_ASSIST_OUTPUT_CHARS = 800;
export const MIN_ASSIST_NOTE_CHARS = 40; // continue guard

// ── WP-AI-007 — global "ask my notes" (retrieval + grounded answer) ──────────
export const ASK_SYSTEM = 'You answer questions using ONLY the provided note extracts. Cite sources inline as [1], [2] matching the numbered extracts. If the extracts do not contain the answer, say so plainly. Plain prose, no markdown headings, no preamble, no invented facts.';
export function askUserPrompt(extracts, question) {
  const blocks = extracts.map((e) => `[${e.index}] (${e.title}):\n${e.text}`).join('\n\n---\n\n');
  return `NOTE EXTRACTS:\n${blocks}\n\nQUESTION:\n${question}`;
}
export const MAX_ASK_QUESTION_CHARS = 1000;
export const MAX_ASK_CONTEXT_CHARS = 900; // per selected note
export const MAX_ASK_SOURCES = 6;
export const ASK_SNIPPET_CHARS = 220;
