/*
 * Minimal stand-in for the api's static-deployment surface, used ONLY by the
 * real-cluster cutover rehearsal (scripts/sec9-cutover/run.sh).
 *
 * It reproduces the three behaviours the cutover actually depends on, and
 * nothing else:
 *   MODE=old  — pre-cutover: serves a public deployment with
 *               `Cache-Control: public, max-age=60` and has NO interlock, so
 *               activation always succeeds. This is the code the barrier exists
 *               to outlast.
 *   MODE=new  — post-cutover: serves `public, no-cache, must-revalidate` and
 *               gates ACTIVATION on DEPLOYMENT_ACCESS_ACTIVATION_ENABLED, while
 *               ENFORCEMENT never depends on that flag.
 *
 * Access state lives in a hostPath file so every pod on the (single-node) kind
 * cluster shares it — the real api shares it through Postgres.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const MODE = process.env.MODE ?? 'new';
const STATE = process.env.STATE_FILE ?? '/state/access.json';
const POD = process.env.POD_NAME ?? 'unknown';
const SECRET_BODY = '<!doctype html><body>SECRET CONTENT</body>';

const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return { mode: 'public' };
  }
};
const writeState = (s) => writeFileSync(STATE, JSON.stringify(s));

const json = (res, code, obj, headers = {}) => {
  res.writeHead(code, { 'content-type': 'application/json', 'x-pod': POD, 'x-mode': MODE, ...headers });
  res.end(JSON.stringify(obj));
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    const payload = body.length ? JSON.parse(Buffer.concat(body).toString() || '{}') : {};
    const state = readState();

    // ---- activation (owner action) ----
    if (req.method === 'POST' && url.pathname === '/access') {
      if (payload.mode === 'password' && MODE === 'new' && process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED !== '1') {
        return json(res, 503, { code: 'DEPLOYMENT_ACCESS_ACTIVATION_DISABLED' });
      }
      writeState(payload.mode === 'password' ? { mode: 'password', password: payload.password } : { mode: 'public' });
      return json(res, 200, { accessMode: payload.mode });
    }

    // ---- unlock ----
    if (req.method === 'POST' && url.pathname === '/__access') {
      if (state.mode === 'password' && payload.password === state.password) {
        return json(res, 200, { ok: true }, { 'set-cookie': `vc_dep=ok-${state.password}; HttpOnly; Path=/` });
      }
      return json(res, 401, { code: 'DEPLOYMENT_PASSWORD_INCORRECT' });
    }

    // ---- serve ----
    if (req.method === 'GET' && url.pathname === '/') {
      // ENFORCEMENT is never gated by the activation flag.
      if (state.mode === 'password') {
        const cookie = req.headers.cookie ?? '';
        if (!cookie.includes(`vc_dep=ok-${state.password}`)) {
          res.writeHead(401, {
            'content-type': 'text/plain',
            'cache-control': 'private, no-store, max-age=0, must-revalidate',
            vary: 'Cookie',
            'x-pod': POD,
            'x-mode': MODE,
          });
          return res.end('Password required');
        }
        res.writeHead(200, {
          'content-type': 'text/html',
          'cache-control': 'private, no-store, max-age=0, must-revalidate',
          vary: 'Cookie',
          'x-pod': POD,
          'x-mode': MODE,
        });
        return res.end(SECRET_BODY);
      }

      // PUBLIC: the header that differs across the cutover.
      res.writeHead(200, {
        'content-type': 'text/html',
        'cache-control': MODE === 'old' ? 'public, max-age=60' : 'public, no-cache, must-revalidate',
        vary: 'Cookie',
        'x-pod': POD,
        'x-mode': MODE,
      });
      return res.end(SECRET_BODY);
    }

    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    return json(res, 404, { code: 'NOT_FOUND' });
  });
}).listen(3001, '0.0.0.0', () => console.log(`stub-api MODE=${MODE} pod=${POD} listening :3001`));
