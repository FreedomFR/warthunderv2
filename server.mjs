// Minimal static dev server (no dependencies).
//   node server.mjs [port]
// Serves this folder. POST /__shot?name=foo.png stores a PNG (sent as raw body)
// into ./shots — used for automated visual checks.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wgsl': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/__shot') {
    const name = path.basename(url.searchParams.get('name') || 'shot.png');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const dir = path.join(root, 'shots');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      console.log('saved shot', name);
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__log') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      console.log('[client]', Buffer.concat(chunks).toString());
      res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const head = { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    // a video is asked for by ranges (the browser wants to seek and to loop)
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const a = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2])), b = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
      if (a > b || a >= data.length) { res.writeHead(416, { 'content-range': `bytes */${data.length}` }); res.end(); return; }
      res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${data.length}`, 'content-length': b - a + 1 });
      res.end(data.subarray(a, b + 1));
      return;
    }
    res.writeHead(200, head);
    res.end(data);
  });
}).listen(port, () => console.log(`ocean dev server: http://localhost:${port}/`));
