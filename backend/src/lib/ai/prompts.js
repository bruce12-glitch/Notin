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
