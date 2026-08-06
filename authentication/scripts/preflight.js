#!/usr/bin/env node
const path = require("path");

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    throw new Error(`Node.js 22.5+ is required (current: ${process.versions.node})`);
  }

  const config = require("../config");
  const db = require("../db");
  const { smtpConfigured } = require("../mailer");
  const health = db.healthCheck();
  if (!health.ok) throw new Error(`Database check failed: ${health.result}`);
  if (config.isProduction && !smtpConfigured) {
    throw new Error("SMTP must be configured in production");
  }
  db.close();
  console.log(`Preflight passed: Node ${process.versions.node}, SQLite ok, ${smtpConfigured ? "SMTP configured" : "development mail mode"}.`);
} catch (error) {
  const hint = /SECRET|\.env/.test(error.message) ? " Run `npm run setup` first." : "";
  console.error(`Preflight failed: ${error.message}.${hint}`);
  process.exit(1);
}
