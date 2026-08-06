// ============================================================
// mailer.js — sends OTP emails
// ============================================================
require("dotenv").config({ quiet: true });
const nodemailer = require("nodemailer");

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 587);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || "Notin <no-reply@notin.app>";

const smtpConfigured = !!(HOST && USER && PASS);
let transporter = null;

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  });
}

function otpEmailHtml(code) {
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:460px;margin:auto;padding:28px;border:1px solid #eee;border-radius:14px">
    <h2 style="margin:0 0 6px">Verify your email</h2>
    <p style="color:#555;margin:0 0 20px">Use this code to finish creating your Notin account.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f8ee;color:#111;
                text-align:center;padding:16px;border-radius:12px">${code}</div>
    <p style="color:#999;font-size:13px;margin-top:18px">This code expires soon. If you didn't request it, ignore this email.</p>
  </div>`;
}

async function sendOtpEmail(to, code) {
  if (!smtpConfigured) {
    console.log(`\n[DEV OTP] code for ${to} is: ${code}\n`);
    return { sent: false, devCode: code };
  }

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Your Notin verification code",
    text: `Your Notin verification code is ${code}`,
    html: otpEmailHtml(code),
  });

  return { sent: true };
}

module.exports = { sendOtpEmail, smtpConfigured };
