// Vínko's own server: serves the game (games/vinko) and keeps one shared pub for everyone connected.
// Each browser sends its presence (who it plays, where, what it does); the server keeps the latest one per
// connection and sends the whole room to everyone whenever anything changes. No accounts, nothing stored.
//   cd games/vinko/server && npm install && npm start      (PORT=8080 by default)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = +(process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || file.includes('/server/') || file.includes('/tools/') || file.includes('/raw/')) { res.writeHead(404).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body); }
  catch { res.writeHead(404).end('not found'); }
});

// The room: one presence object per connection, at most 4 KiB, re-broadcast at most ~20 times a second.
const wss = new WebSocketServer({ server, path: '/room', maxPayload: 8 * 1024 });
const peers = new Map();   // ws -> { peer, presence }
let n = 0, dirty = false;
wss.on('connection', ws => {
  const peer = `p${Date.now().toString(36)}${(n++).toString(36).padStart(3, '0')}`;
  peers.set(ws, { peer, presence: {} });
  ws.send(JSON.stringify({ t: 'hello', peer }));
  dirty = true;
  ws.on('message', buf => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m && m.t === 'presence' && m.p && typeof m.p === 'object' && JSON.stringify(m.p).length <= 4096) { peers.get(ws).presence = m.p; dirty = true; }
  });
  ws.on('close', () => { peers.delete(ws); dirty = true; });
});
setInterval(() => {
  if (!dirty) return; dirty = false;
  const list = [...peers.values()];
  const msg = JSON.stringify({ t: 'peers', peers: list });
  for (const ws of peers.keys()) if (ws.readyState === 1) ws.send(msg);
}, 50);

server.listen(PORT, () => console.log(`Vínko on http://localhost:${PORT}`));
