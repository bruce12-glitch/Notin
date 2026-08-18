// Notin design-showcase server
// Serves the post-auth UI/UX design gallery (design.html) as a STANDALONE preview,
// with `/` rewriting to the showcase. Static only — no API proxy (read-only mock).
//
// Usage:
//   node design-server.mjs                 # port 4100
//   PORT=4100 node design-server.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4100);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Root → the design showcase
    if (pathname === '/') pathname = '/design.html';

    const filePath = path.normalize(path.join(__dirname, pathname));
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end('Forbidden');
    }

    const stat = fs.existsSync(filePath) && fs.statSync(filePath);
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1><p>Not found.</p>');
    }

    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎨 Notin design showcase on http://0.0.0.0:${PORT}`);
  console.log(`   Post-auth UI/UX gallery: /  (design.html)`);
});
