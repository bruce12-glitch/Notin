// ============================================================
// mailer.js — OTP and password-reset delivery
// ============================================================
const nodemailer = require("nodemailer");
const config = require("./config");

const smtpConfigured = !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;

function shell(content) {
  return `
  <div style="background:#f4f1ea;padding:32px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#171817">
    <div style="max-width:460px;margin:auto;background:#fff;padding:28px;border:1px solid #e7e4dd;border-radius:16px;box-shadow:0 18px 45px rgba(20,20,16,.08)">
      <div style="font-size:20px;font-weight:800;margin-bottom:20px">Not<span style="color:#00a82d">in</span></div>
      ${content}
    </div>
  </div>`;
}

function otpEmailHtml(code) {
  return shell(`
    <h2 style="margin:0 0 6px">Verify your email</h2>
    <p style="color:#555;margin:0 0 20px;line-height:1.5">Use this code to finish creating your Notin account.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f0f8e9;color:#111;text-align:center;padding:16px;border-radius:12px">${code}</div>
    <p style="color:#777;font-size:13px;margin-top:18px;line-height:1.5">This code expires in ${config.OTP_TTL_MINUTES} minutes. Notin will never ask you to share this code.</p>
  `);
}

async function sendOtpEmail(to, code) {
  if (!smtpConfigured) {
    if (!config.isProduction) console.log(`\n[DEV OTP] code for ${to} is: ${code}\n`);
    return { sent: false, ...(!config.isProduction ? { devCode: code } : {}) };
  }

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: "Your Notin verification code",
    text: `Your Notin verification code is ${code}. It expires in ${config.OTP_TTL_MINUTES} minutes.`,
    html: otpEmailHtml(code),
  });
  return { sent: true };
}

async function sendPasswordResetEmail(to, token) {
  const base = config.APP_URL.replace(/\/$/, "");
  const resetUrl = `${base}/?resetToken=${encodeURIComponent(token)}`;

  if (!smtpConfigured) {
    if (!config.isProduction) console.log(`\n[DEV RESET] link for ${to}: ${resetUrl}\n`);
    return { sent: false, ...(!config.isProduction ? { devResetToken: token, devResetUrl: resetUrl } : {}) };
  }

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: "Reset your Notin password",
    text: `Reset your Notin password: ${resetUrl}\nThis link expires in 30 minutes.`,
    html: shell(`
      <h2 style="margin:0 0 8px">Reset your password</h2>
      <p style="color:#555;line-height:1.5">Use the secure button below within 30 minutes. If you did not request this, you can ignore this email.</p>
      <p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Reset password</a></p>
      <p style="color:#777;font-size:12px;word-break:break-all">${resetUrl}</p>
    `),
  });
  return { sent: true };
}

async function verifyMailer() {
  if (!transporter) return { configured: false };
  await transporter.verify();
  return { configured: true };
}

module.exports = { sendOtpEmail, sendPasswordResetEmail, verifyMailer, smtpConfigured };
