import { createServer } from 'node:http';
import { buildApiApp } from 'services/api/src/app';
import { TestApiStore } from 'services/api/src/tests/test-api-store';

const web = 'http://127.0.0.1:19871';
const google = 'http://127.0.0.1:19873';
Object.assign(process.env, {
  APP_PUBLIC_URL: web,
  GOOGLE_CLIENT_ID: 'local-client',
  GOOGLE_CLIENT_SECRET: 'local-test',
  GOOGLE_OAUTH_AUTHORIZATION_URL: google + '/authorize',
  GOOGLE_TOKEN_URL: google + '/token',
  GOOGLE_USERINFO_URL: google + '/userinfo',
  GOOGLE_REDIRECT_URI: web + '/auth/oauth/google/callback',
  OAUTH_STATE_SECRET: 'local-test-only-state-key-123456789',
  ENCRYPTION_SECRET: 'local-test-only-encryption-key-123456789',
});
createServer(async (req, res) => {
  const url = new URL(req.url!, google);

  if (url.pathname === '/authorize') {
    const cb = new URL(process.env.GOOGLE_REDIRECT_URI!);
    cb.searchParams.set('state', url.searchParams.get('state')!);
    cb.searchParams.set('code', 'local-code');
    res.writeHead(302, { location: cb.href }).end();

    return;
  }

  res.setHeader('content-type', 'application/json');

  if (url.pathname === '/token') {
    let body = '';

    for await (const chunk of req) {
      body += chunk;
    }

    if (new URLSearchParams(body).get('code') === 'local-code') {
      res.end(JSON.stringify({ access_token: 'local-token' }));
      return;
    }
  }

  if (url.pathname === '/userinfo' && req.headers.authorization === 'Bearer local-token') {
    res.end(
      JSON.stringify({ sub: 'local-id', email: 'google@local.test', email_verified: true, name: 'Local Google' }),
    );
    return;
  }

  res.writeHead(400).end('{}');
}).listen(19873, '127.0.0.1');

const app = await buildApiApp({
  store: new TestApiStore(),
  emailProvider: {
    async send() {
      /* Mail delivery is outside this OAuth fixture. */
    },
  },
});
await app.listen({ port: 19872, host: '127.0.0.1' });
