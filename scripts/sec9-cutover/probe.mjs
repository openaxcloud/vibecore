/*
 * In-cluster HTTP probe for the cutover harness.
 *
 * Deliberately NOT curl-from-a-public-image. Pulling curlimages/curl made every
 * probe depend on a registry: on a fresh kind node it 404s or rate-limits, and a
 * failed pull surfaces as an EMPTY response — which an assertion expecting "401"
 * reports as a product failure when nothing was observed at all. `kind load` of
 * that image also fails on this host ("ctr: content digest ... not found",
 * multi-arch manifest). This runs inside the stub api image, which the harness
 * already loads, so the probe has no external dependency whatsoever.
 *
 * Prints a curl-like transcript so the shell can grep it unchanged:
 *   HTTP/1.1 <status> <text>
 *   <header>: <value>
 *   <blank line>
 *   <body>
 *
 * Usage: node probe.mjs <method> <url> [jsonBody]
 */
import { request } from 'node:http';

const [method, url, body] = process.argv.slice(2);

const req = request(
  url,
  { method, headers: body ? { 'content-type': 'application/json' } : {} },
  (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      process.stdout.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage ?? ''}\n`);

      for (const [k, v] of Object.entries(res.headers)) {
        process.stdout.write(`${k}: ${Array.isArray(v) ? v.join(', ') : v}\n`);
      }

      process.stdout.write(`\n${Buffer.concat(chunks).toString()}`);
      process.exit(0);
    });
  },
);

req.on('error', (e) => {
  process.stderr.write(`PROBE_ERROR ${e.message}\n`);
  process.exit(1);
});
req.setTimeout(20000, () => {
  process.stderr.write('PROBE_ERROR timeout\n');
  req.destroy();
  process.exit(1);
});

if (body) {
  req.write(body);
}

req.end();
