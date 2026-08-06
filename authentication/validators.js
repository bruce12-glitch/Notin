// ============================================================
// validators.js — strict request validation and password policy
// ============================================================
const { z } = require("zod");

const email = z.string().trim().toLowerCase().email("A valid email is required").max(254);
const commonPasswords = new Set([
  "password123", "password123!", "qwerty12345", "letmein123", "admin12345",
]);
const password = z.string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/\d/, "Password needs a number")
  .refine((value) => !commonPasswords.has(value.toLowerCase()), "Choose a less common password");

const schemas = {
  register: z.object({
    email,
    password,
    displayName: z.string().trim().max(60).optional(),
  }).strict(),
  login: z.object({
    email,
    password: z.string().min(1, "Password is required").max(128),
  }).strict(),
  verifyOtp: z.object({
    email,
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  }).strict(),
  resendOtp: z.object({ email }).strict(),
  updateProfile: z.object({ displayName: z.string().trim().min(1).max(60) }).strict(),
  changePassword: z.object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: password,
  }).strict().refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different",
    path: ["newPassword"],
  }),
  deleteAccount: z.object({
    currentPassword: z.string().min(1, "Password is required").max(128),
  }).strict(),
  forgotPassword: z.object({ email }).strict(),
  resetPassword: z.object({
    token: z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/, "Invalid reset token"),
    newPassword: password,
  }).strict(),
  createNote: z.object({
    title: z.string().trim().max(200, "Title is too long").default(""),
    body: z.string().max(100000, "Note is too long").default(""),
  }).strict().refine((data) => data.title.length > 0 || data.body.trim().length > 0, {
    message: "Note needs a title or body",
  }),
  updateNote: z.object({
    title: z.string().trim().max(200, "Title is too long").optional(),
    body: z.string().max(100000, "Note is too long").optional(),
  }).strict().refine((data) => data.title !== undefined || data.body !== undefined, {
    message: "No note changes supplied",
  }),
};

function validate(schemaName) {
  const schema = schemas[schemaName];
  if (!schema) throw new Error(`Unknown validation schema: ${schemaName}`);
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        error: issue?.message || "Invalid input",
        field: issue?.path?.[0] || undefined,
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate, schemas, passwordSchema: password };
