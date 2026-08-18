// Notin app-UI frontend dev server
// - Serves the authentication/ app screens (signup, login, editor app.html,
//   public share.html, PWA shell, styles, icons) as a STANDALONE frontend.
// - Proxies /api/* and /auth/* to the Notin backend (default http://127.0.0.1:5000)
//   so the frontend origin stays separate while API/auth traffic still reaches
//   the backend on a single browser origin (required for live-preview hosts).
//
// Usage:
//   node dev-server.mjs                     # port 4000
//   PORT=4000 API_TARGET=http://127.0.0.1:5000 node dev-server.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:5000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
]);

function shouldProxy(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/') ||
         pathname === '/auth' || pathname.startsWith('/auth/');
}

function proxyToApi(req, res) {
  const target = new URL(API_TARGET);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http';

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v;
      }
      // Allow embedding in the live-preview iframe
      delete outHeaders['x-frame-options'];
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    console.error(`[proxy] ${req.method} ${req.url} -> ${API_TARGET} failed:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'api_unreachable', target: API_TARGET }));
  });
  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  const stat = fs.existsSync(filePath) && fs.statSync(filePath);
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<h1>404 — Notin</h1><p>Not found.</p>');
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  res.setHeader('accept-ranges', 'bytes');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('content-type', type);

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
    res.writeHead(206, {
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'content-length': end - start + 1,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  }
}

const server = http.createServer((req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (shouldProxy(pathname)) return proxyToApi(req, res);
    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📝 Notin app-UI frontend on http://0.0.0.0:${PORT}`);
  console.log(`   Sign up:   /            (index.html)`);
  console.log(`   Log in:    /login.html`);
  console.log(`   Editor:    /app.html`);
  console.log(`   Share:     /share.html`);
  console.log(`   Proxying /api/* and /auth/* -> ${API_TARGET}`);
});
