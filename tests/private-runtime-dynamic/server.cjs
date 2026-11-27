const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const server = http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.end('ready');
      return;
    }
    const a = url.searchParams.get('a');
    const b = url.searchParams.get('b');
    if (req.method !== 'GET' || url.pathname !== '/compute' || !/^\d{1,7}$/.test(a) || !/^\d{1,7}$/.test(b)) {
      res.writeHead(404).end();
      return;
    }
    const { version, factor } = JSON.parse(fs.readFileSync(path.join(__dirname, 'rule.json'), 'utf8'));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ version, result: Number(a) * factor + Number(b) }));
  })
  .listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => process.send?.(server.address().port));
