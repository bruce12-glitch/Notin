// Publish only the marketing runtime, never source, package files or tooling.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const files = [
  'index.html', 'index-neon.html', 'context.html', 'privacy.html',
  'terms.html', 'security.html', 'script.js', 'three-hero.js',
  'styles.css', 'styles-neon.css', 'polish.css', 'legal.css',
  'robots.txt', 'sitemap.xml', 'assets',
];
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of files) {
  cpSync(path.join(root, 'frontend', file), path.join(output, file), { recursive: true });
}
console.log('Pages artifact staged in _site');
