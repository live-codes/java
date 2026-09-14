import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8931);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.jar': 'application/java-archive',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!path || path === '.') path = 'poc/index.html';
    const file = join(root, path);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(file).catch(() => null);
    const target = info?.isDirectory() ? join(file, 'index.html') : file;
    const content = await readFile(target);
    res.writeHead(200, {
      'content-type': types[extname(target)] ?? 'application/octet-stream',
      'content-length': content.length,
      'access-control-allow-origin': '*',
    });
    res.end(content);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`PoC server: http://localhost:${port}/poc/`);
});
