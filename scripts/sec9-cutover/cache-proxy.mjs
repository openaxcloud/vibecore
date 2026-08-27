/*
 * A minimal SHARED CACHE, standing in for the intermediary the origin cannot
 * purge (a CDN, a corporate proxy, any downstream cache).
 *
 * It implements only the rule that matters for SEC-8, and implements it the way
 * RFC 9111 says a shared cache may behave:
 *   - a response with `Cache-Control: public, max-age=N` is stored and REUSED
 *     WITHOUT contacting the origin for N seconds  -> X-Cache: HIT
 *   - `no-cache` / `must-revalidate` may be stored but must be REVALIDATED
 *     before every reuse                            -> X-Cache: REVALIDATED
 *   - `no-store` is never stored                    -> X-Cache: MISS
 *
 * That single behaviour is the whole vulnerability: the origin can flip a
 * deployment to password-protected, and this cache will keep handing the old
 * public bytes to anonymous visitors until the entry goes stale.
 */
import { createServer, request as httpRequest } from 'node:http';

const UPSTREAM = process.env.UPSTREAM ?? 'http://api:3001';
const store = new Map();

const fetchUpstream = (path, headers) =>
  new Promise((resolve, reject) => {
    const target = new URL(path, UPSTREAM);
    const req = httpRequest(
      { hostname: target.hostname, port: target.port, path: target.pathname, method: 'GET', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });

const parseMaxAge = (cc = '') => {
  const m = /max-age=(\d+)/.exec(cc);
  return m ? Number(m[1]) : 0;
};

createServer(async (req, res) => {
  const key = req.url;
  const now = Date.now();
  const entry = store.get(key);

  // Fresh, reusable WITHOUT revalidation — the dangerous case.
  if (entry && entry.freshUntil > now) {
    res.writeHead(entry.status, { ...entry.headers, 'x-cache': 'HIT', 'x-cache-age': `${Math.floor((now - entry.storedAt) / 1000)}` });
    res.end(entry.body);
    return;
  }

  let upstream;

  try {
    upstream = await fetchUpstream(key, { cookie: req.headers.cookie ?? '' });
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`proxy upstream error: ${e.message}`);
    return;
  }

  const cc = String(upstream.headers['cache-control'] ?? '');
  const storable = cc.includes('public') && !cc.includes('no-store');
  const maxAge = cc.includes('no-cache') ? 0 : parseMaxAge(cc);

  if (storable && maxAge > 0) {
    store.set(key, {
      status: upstream.status,
      headers: upstream.headers,
      body: upstream.body,
      storedAt: now,
      freshUntil: now + maxAge * 1000,
    });
  }

  const label = entry ? 'REVALIDATED' : 'MISS';
  res.writeHead(upstream.status, { ...upstream.headers, 'x-cache': label });
  res.end(upstream.body);
}).listen(8080, '0.0.0.0', () => console.log(`cache-proxy -> ${UPSTREAM} on :8080`));
