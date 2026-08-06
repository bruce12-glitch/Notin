// ============================================================
// validators.js — request body validation with zod
// ============================================================
const { z } = require("zod");

const email = z.string().trim().toLowerCase().email("A valid email is required");
const password = z.string().min(8, "Password must be at least 8 characters").max(128);

const schemas = {
  register: z.object({
    email,
    password,
    displayName: z.string().trim().max(60).optional(),
  }),
  login: z.object({ email, password: z.string().min(1, "Password is required") }),
  verifyOtp: z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }),
  updateProfile: z.object({ displayName: z.string().trim().min(1).max(60) }),
  changePassword: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: password,
  }),
  forgotPassword: z.object({ email }),
  resetPassword: z.object({ token: z.string().min(10), newPassword: password }),
};

function validate(schemaName) {
  const schema = schemas[schemaName];
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const msg = result.error.issues[0]?.message || "Invalid input";
      return res.status(400).json({ error: msg });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
