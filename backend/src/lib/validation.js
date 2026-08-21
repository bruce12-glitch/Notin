// WP-HARDEN-001 — centralized runtime request validation (Zod, plain JS).
//
// All mutable backend routes validate through these schemas BEFORE any
// database write, AI provider call, file mutation, email send, or token
// mutation. Unknown properties are rejected (.strict()) except where a legacy
// contract needs them; the few places that must keep a legacy exact error
// body handle it in the controller and only use these schemas for shape/type.
//
// Never expose Zod internals to clients: controllers convert failures via
// zodDetails() and send the standard envelope from lib/apiResponse.js.

import { z } from 'zod';
import { sendValidationError } from './apiResponse.js';

// ── shared primitives ────────────────────────────────────────────────────────

// Server-generated ids look like `c<hex>` (or `att_<uuid>`); the same sane
// charset the request-id middleware accepts. `-`/`_` kept for legacy ids.
export const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const idSchema = z
  .string({ invalid_type_error: 'Must be a valid id string' })
  .min(1, 'Must be a valid id string')
  .max(128, 'Must be a valid id string')
  .regex(ID_RE, 'Must be a valid id string');

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

// Email rule identical to the pre-hardening auth regex (contract preserved).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z
  .string({ invalid_type_error: 'Valid email required' })
  .trim()
  .toLowerCase()
  .regex(EMAIL_RE, 'Valid email required');

export const usernameSchema = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z
      .string({ invalid_type_error: 'Username must be 50 characters or fewer' })
      .trim()
      .min(1, 'Username must be 50 characters or fewer')
      .max(50, 'Username must be 50 characters or fewer')
      .refine((value) => !CONTROL_CHARS_RE.test(value), 'Username cannot contain control characters')
      .nullable()
      .optional()
  );

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ');
}

function noControlChars(value) {
  return !CONTROL_CHARS_RE.test(value);
}

// ── notes ────────────────────────────────────────────────────────────────────

export const NOTE_TITLE_MAX = 500;
export const NOTE_DESCRIPTION_MAX = 100_000;
export const NOTE_CONTENT_TEXT_MAX = 500_000;
export const NOTE_CONTENT_JSON_MAX_BYTES = 2 * 1024 * 1024; // 2 MB serialized
export const NOTE_TAG_IDS_MAX = 50;
export const NOTE_QUERY_MAX = 500;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

// Deep-walks a candidate TipTap document and returns an error string, or null
// when the value is a plain, acyclic, JSON-serializable object whose UTF-8
// serialization is at most 2 MB. Rejects arrays/primitives at the top level,
// cyclic references, functions, undefined, symbols, bigint, NaN/Infinity, and
// anything JSON.stringify would silently drop or mangle.
function contentJsonError(value, seen = new WeakSet(), depth = 0) {
  if (depth > 100) return 'contentJson is nested too deeply';
  if (value === null || value === undefined) return 'contentJson must be a JSON object';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return null;
  if (type === 'number') {
    return Number.isFinite(value) ? null : 'contentJson must not contain NaN or Infinity';
  }
  if (type === 'bigint' || type === 'function' || type === 'symbol') {
    return 'contentJson must not contain functions, undefined, symbols, or bigint values';
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return 'contentJson must not contain cyclic values';
    seen.add(value);
    for (const item of value) {
      const error = contentJsonError(item, seen, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return 'contentJson must not contain cyclic values';
    seen.add(value);
    for (const key of Object.keys(value)) {
      const error = contentJsonError(value[key], seen, depth + 1);
      if (error) return error;
    }
    return null;
  }
  return 'contentJson must be a JSON-compatible object';
}

function contentJsonRefine(value) {
  if (!isPlainObject(value)) return false; // TipTap docs are objects; arrays/primitives rejected
  const walkError = contentJsonError(value);
  if (walkError) return false;
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') return false;
  return Buffer.byteLength(serialized, 'utf8') <= NOTE_CONTENT_JSON_MAX_BYTES;
}

export const contentJsonSchema = z.custom(
  contentJsonRefine,
  'contentJson must be a JSON-compatible object of at most 2 MB'
);

export const tagIdsSchema = z
  .array(idSchema, { invalid_type_error: 'tagIds must be an array of tag id strings' })
  .max(NOTE_TAG_IDS_MAX, `tagIds must contain at most ${NOTE_TAG_IDS_MAX} tag ids`)
  .refine((ids) => new Set(ids).size === ids.length, 'tagIds must not contain duplicates');

// notebookId: a real id, '', or null. '' and null both mean "unfiled" — that
// mapping lives in the controller (legacy contract).
export const notebookIdSchema = z.union([
  idSchema,
  z.literal('', { invalid_type_error: 'notebookId must be a notebook id or null' }),
  z.null(),
]);

const noteBaseFields = {
  title: z
    .string({ invalid_type_error: 'Title must be 500 characters or fewer' })
    .trim()
    .max(NOTE_TITLE_MAX, `Title must be ${NOTE_TITLE_MAX} characters or fewer`)
    .optional(),
  description: z
    .string({ invalid_type_error: 'Description must be 100,000 characters or fewer' })
    .max(NOTE_DESCRIPTION_MAX, `Description must be ${NOTE_DESCRIPTION_MAX} characters or fewer`)
    .optional(),
  contentText: z
    .string({ invalid_type_error: 'Note text must be 500,000 characters or fewer' })
    .max(NOTE_CONTENT_TEXT_MAX, `Note text must be ${NOTE_CONTENT_TEXT_MAX} characters or fewer`)
    .optional(),
  contentJson: contentJsonSchema.optional(),
  notebookId: notebookIdSchema.optional(),
};

export const noteCreateSchema = z.object({
  ...noteBaseFields,
  // isPinned/isTrashed/tagIds are update-only today; unknown-key rejection
  // keeps them from silently disappearing on create.
}).strict();

export const noteUpdateSchema = z.object({
  ...noteBaseFields,
  tagIds: tagIdsSchema.optional(),
  isPinned: z.boolean({ invalid_type_error: 'isPinned must be a boolean' }).optional(),
  isTrashed: z.boolean({ invalid_type_error: 'isTrashed must be a boolean' }).optional(),
  // trashedAt is deliberately NOT accepted: server timestamps are
  // authoritative (WP-HARDEN-001).
}).strict();

// ── notebooks / tags ─────────────────────────────────────────────────────────

export const NOTEBOOK_NAME_MAX = 100;
export const TAG_NAME_MAX = 50;

const namePipeline = (max, requiredMessage, tooLongMessage, controlMessage) =>
  z
    .string({ invalid_type_error: requiredMessage })
    .trim()
    .transform(collapseWhitespace)
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .max(max, tooLongMessage)
        .refine(noControlChars, controlMessage)
    );

export const notebookSchema = z
  .object({
    name: namePipeline(
      NOTEBOOK_NAME_MAX,
      'Notebook name is required',
      `Notebook name too long (max ${NOTEBOOK_NAME_MAX} chars)`,
      'Notebook name cannot contain control characters'
    ),
  })
  .strict();

export const tagSchema = z
  .object({
    name: namePipeline(
      TAG_NAME_MAX,
      'Tag name is required',
      `Tag name too long (max ${TAG_NAME_MAX} chars)`,
      'Tag name cannot contain control characters'
    ),
  })
  .strict();

// ── auth ─────────────────────────────────────────────────────────────────────

export const signupSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: z
      .string({ invalid_type_error: 'Password must be at least 8 characters' })
      .min(8, 'Password must be at least 8 characters'),
  })
  .strict();

// Signin keeps its legacy coercion and 404/401/429 contract in the controller;
// the schema only guards shape/type so a non-object body cannot slip through.
export const signinSchema = z
  .object({
    email: z.string({ invalid_type_error: 'Email and password are required' }),
    password: z.string({ invalid_type_error: 'Email and password are required' }),
  })
  .strict();

export const otpEmailSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const otpVerifySchema = z
  .object({
    challenge: z.string({ invalid_type_error: 'Invalid code' }).min(1, 'Invalid code'),
    code: z
      .string({ invalid_type_error: 'Invalid code' })
      .regex(/^[0-9]{6}$/, 'Invalid code'),
  })
  .strict();

// Forgot-password is anti-enumeration by design: the controller maps every
// failure (including schema failures) to the same generic success body.
export const forgotPasswordSchema = z
  .object({
    email: z.string({ invalid_type_error: 'Email must be a string' }).trim().max(254),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string({ invalid_type_error: 'Reset token required' }).min(1, 'Reset token required'),
    password: z
      .string({ invalid_type_error: 'Password must be at least 8 characters' })
      .min(8, 'Password must be at least 8 characters'),
  })
  .strict();

// ── AI ───────────────────────────────────────────────────────────────────────

export const MAX_CHAT_HISTORY_TURNS = 6;
export const MAX_CHAT_HISTORY_CONTENT_CHARS = 2000;

export const chatHistorySchema = z
  .array(
    z
      .object({
        role: z.enum(['user', 'assistant'], {
          invalid_type_error: 'history role must be "user" or "assistant"',
          required_error: 'history item must include a role',
        }),
        content: z
          .string({ invalid_type_error: 'history content must be a string' })
          .min(1, 'history content must not be empty')
          .max(MAX_CHAT_HISTORY_CONTENT_CHARS, `history content must be ${MAX_CHAT_HISTORY_CONTENT_CHARS} characters or fewer`),
      })
      .strict(),
    { invalid_type_error: 'history must be an array of chat turns' }
  )
  .max(MAX_CHAT_HISTORY_TURNS, `history must contain at most ${MAX_CHAT_HISTORY_TURNS} turns`);

export const chatBodySchema = z
  .object({
    // Question emptiness/length keeps the legacy guard message in the
    // controller; the schema only enforces the type here.
    question: z.string({ invalid_type_error: 'Ask a question (1–2000 characters)' }).trim().optional(),
    history: chatHistorySchema.optional(),
  })
  .strict();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Convert a ZodError into the standard details array. */
export function zodDetails(error) {
  return (error.issues || []).map((issue) => {
    const field = issue.keys && issue.keys.length
      ? issue.keys.join(', ')
      : (issue.path.length ? issue.path.join('.') : 'body');
    return { field, message: issue.message };
  });
}

/**
 * Validate `req.body` (treating missing/non-object bodies as `{}`) against a
 * schema. On success returns the parsed data; on failure sends the standard
 * validation envelope and returns null — controllers must `return` when null.
 */
export function validateBody(schema, req, res) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const result = schema.safeParse(body);
  if (!result.success) {
    sendValidationError(res, zodDetails(result.error));
    return null;
  }
  return result.data;
}
