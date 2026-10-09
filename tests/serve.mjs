import http from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = { '/': ['tests/fixture.html', 'text/html'], '/multiview.js': ['dist/multiview.js', 'text/javascript'] };
http.createServer(async (req, res) => {
  const entry = routes[req.url];
  if (!entry) { res.writeHead(404).end(); return; }
  try { res.setHeader('Content-Type', entry[1]); res.end(await readFile(entry[0])); }
  catch { res.writeHead(500).end(); }
}).listen(4173, '127.0.0.1');
