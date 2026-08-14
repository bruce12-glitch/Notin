export const SUMMARIZE_SYSTEM = 'You summarize notes. Reply with 3 to 5 sentences of plain prose that capture the note\'s key points. No markdown, no headings, no bullet points, no preamble.';

export function summarizeUserPrompt(text) {
  return `Summarize this note:\n\n${text}`;
}

export const MAX_INPUT_CHARS = 6000;
