/** A real pod-hosted HTTP fixture, distinct from the IDE's raw-HTML srcdoc preview. */
export const staticServerSource = `const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/' && pathname !== '/index.html') {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
    return;
  }
  try {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end('Could not read index.html');
  }
});
server.listen(5173, '0.0.0.0', () => {
  console.log('Static fixture ready at http://0.0.0.0:5173/');
});
`;

export function serverBackedStaticFiles(marker: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({ private: true, scripts: { dev: 'node server.cjs' } }),
    'server.cjs': staticServerSource,
    'index.html': `<!doctype html><html><body><main id="app">${marker}</main></body></html>`,
  };
}
