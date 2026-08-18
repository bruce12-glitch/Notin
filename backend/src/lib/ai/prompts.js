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
