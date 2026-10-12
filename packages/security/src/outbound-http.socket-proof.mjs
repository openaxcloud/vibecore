import assert from 'node:assert/strict';
import dns from 'node:dns';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { fetchOutbound, resolveOutboundDestination } from './outbound-http-proof.mjs';

// Run inside the isolated proof container, attached to an internal Docker network.
const publicIp = '93.184.216.34';

let publicHits = 0;
let privateHits = 0;
let defaultDnsCalls = 0;

const publicServer = createServer((req, res) => {
  publicHits++;
  assert.equal(req.headers.host, `rebind.test:${port}`);

  if (req.url === '/redirect') {
    res.writeHead(302, { location: `http://127.0.0.1:${port}/private` });
    res.end();
  } else {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers['x-vibecore-signature'], 'fixture-signature');
      assert.equal(body, '{"event":"fixture"}');
      res.end('public endpoint');
    });
  }
});
publicServer.listen(0, publicIp);
await once(publicServer, 'listening');

const port = publicServer.address().port;

const privateServer = createServer((_req, res) => {
  privateHits++;
  res.end('private endpoint');
});
privateServer.listen(port, '127.0.0.1');
await once(privateServer, 'listening');

const originalLookup = dns.lookup;

dns.lookup = (hostname, options, callback) => {
  if (hostname !== 'rebind.test') {
    originalLookup(hostname, options, callback);

    return;
  }

  defaultDnsCalls++;

  if (options.all) {
    callback(null, [{ address: '127.0.0.1', family: 4 }]);
  } else {
    callback(null, '127.0.0.1', 4);
  }
};

try {
  // Positive witness: the exact forbidden listener is physically reachable.
  await new Promise((resolve, reject) => {
    request(`http://127.0.0.1:${port}/private`, (response) => {
      response.resume();
      response.on('end', resolve);
    })
      .on('error', reject)
      .end();
  });
  assert.equal(privateHits, 1);
  privateHits = 0;

  let resolutions = 0;

  const policy = {
    allowedHostSuffixes: [],
    allowAnyPublicHost: true,
    resolveHost: async () => {
      resolutions++;

      return [publicIp];
    },
  };

  const response = await fetchOutbound(`http://rebind.test:${port}/`, policy, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vibecore-signature': 'fixture-signature' },
    body: '{"event":"fixture"}',
  });
  assert.equal(await response.text(), 'public endpoint');
  assert.equal(publicHits, 1);
  assert.equal(privateHits, 0);
  assert.equal(resolutions, 1);
  assert.equal(defaultDnsCalls, 0);

  const redirect = await fetchOutbound(`http://rebind.test:${port}/redirect`, policy);
  assert.equal(redirect.status, 302);
  assert.equal(privateHits, 0);

  const blocked = await resolveOutboundDestination(`http://rebind.test:${port}/`, {
    ...policy,
    resolveHost: async () => [publicIp, '127.0.0.1'],
  });
  assert.equal(blocked.rejection, 'BLOCKED_ADDRESS');
  assert.equal(publicHits, 2);
  assert.equal(privateHits, 0);
  console.log(JSON.stringify({ publicHits, privateHits, defaultDnsCalls, directPrivateWitness: 1 }));
} finally {
  console.error(JSON.stringify({ fixturePublicHits: publicHits, fixturePrivateHits: privateHits }));
  dns.lookup = originalLookup;
  await Promise.all([
    new Promise((resolve) => publicServer.close(resolve)),
    new Promise((resolve) => privateServer.close(resolve)),
  ]);
}
