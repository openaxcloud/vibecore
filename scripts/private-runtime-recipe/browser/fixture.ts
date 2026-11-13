import JSZip from 'jszip';

export const originalMarker = 'private-browser-original';
export const editedMarker = 'private-browser-edited';
export const fixtureHtml = (marker: string) =>
  `<!doctype html><html><head><title>Private browser recipe</title></head><body><h1 id="proof">${marker}</h1></body></html>\n`;

/** Controlled application code, imported by the real UI; no generated conversation or mocked response. */
export async function browserFixtureArchive() {
  const archive = new JSZip();
  archive.file('index.html', fixtureHtml(originalMarker));
  archive.file(
    'package.json',
    JSON.stringify({
      name: 'private-browser-recipe',
      version: '1.0.0',
      private: true,
      scripts: { dev: 'node server.cjs', start: 'node server.cjs' },
    }),
  );
  archive.file(
    'server.cjs',
    `const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.readFileSync('index.html'));
});
server.listen(Number(process.env.PORT ?? 5173), '0.0.0.0', () => console.log('Local: http://localhost:' + server.address().port));
`,
  );

  return archive.generateAsync({ type: 'nodebuffer' });
}
