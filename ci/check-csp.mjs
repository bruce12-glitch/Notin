#!/usr/bin/env node
// WP-AUDIT-H1/H3 — CI guard: the production CSP (script-src 'self') and IP
// policy must never regress on the marketing pages.
//   1. No inline <script> blocks in frontend/*.html (external src= and
//      application/ld+json data blocks are allowed).
//   2. No references to removed third-party-owned assets anywhere in the
//      published tree.
// Exits 1 (with a readable report) on any violation.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

// ── 1. inline scripts ────────────────────────────────────────────────────────
const frontendDir = join(root, 'frontend');
for (const file of readdirSync(frontendDir)) {
  if (!file.endsWith('.html')) continue;
  const html = readFileSync(join(frontendDir, file), 'utf8');
  const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || [];
  for (const tag of inline) {
    if (tag.includes('application/ld+json')) continue; // data block, not executed
    failures.push(`frontend/${file}: inline <script> block found: ${tag}`);
  }
}

// ── 2. removed third-party assets ────────────────────────────────────────────
const BANNED = [
  'evernote-homepage.json',
  'hero-anim-data.js',
  'hero-demo-full.mp4',
  'hero-demo-poster.jpg',
  'evernote.cdn.prismic.io',
];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);
const SKIP_FILES = new Set(['evernote-analysis.md', 'check-csp.mjs', 'CHANGELOG.md', 'GAP_ANALYSIS.md']);
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (SKIP_FILES.has(entry)) continue;
    if (!/\.(html|js|css|md|json|mjs|xml|txt)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    for (const banned of BANNED) {
      if (text.includes(banned)) {
        failures.push(`${full.slice(root.length + 1)}: references removed asset '${banned}'`);
      }
    }
  }
}
walk(root);

if (failures.length) {
  console.error('✖ CSP / asset guard failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ CSP guard: no inline scripts, no removed-asset references');
