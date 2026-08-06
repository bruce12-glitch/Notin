#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function requireNode22() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    throw new Error(`Node.js 22.5+ is required (current: ${process.versions.node})`);
  }
}

function randomSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

try {
  requireNode22();
  if (!fs.existsSync(envPath)) {
    let env = fs.readFileSync(examplePath, "utf8");
    const values = {
      ACCESS_TOKEN_SECRET: randomSecret(),
      REFRESH_TOKEN_SECRET: randomSecret(),
      CSRF_SECRET: randomSecret(),
      OTP_PEPPER: randomSecret(),
    };
    for (const [name, value] of Object.entries(values)) {
      env = env.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
    }
    fs.writeFileSync(envPath, env, { mode: 0o600 });
    console.log("Created authentication/.env with independent random secrets.");
  } else {
    console.log("authentication/.env already exists; secrets were not changed.");
  }

  require("dotenv").config({ path: envPath, quiet: true });
  process.env.NODE_ENV ||= "development";
  const config = require("../config");
  const db = require("../db");
  const health = db.healthCheck();
  if (!health.ok) throw new Error(`SQLite quick_check failed: ${health.result}`);
  const cleanup = db.cleanupExpired();
  db.close();

  console.log(`Database initialized and migrated: ${health.path}`);
  console.log(`Expired rows cleaned: ${JSON.stringify(cleanup)}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log("Setup complete. Run `npm start`.");
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exit(1);
}
