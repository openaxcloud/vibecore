import { writeFileSync } from 'node:fs';
import { createRuntimeAgentRouter, createServiceLookup } from './upstream/runtime-agent-router.mjs';

const evidence = { capabilityRequests: 0, installRequests: 0, installStatuses: [], genericCommands: 0 };
const target = `${process.env.EVIDENCE_DIR}/transport.json`;
const save = () => writeFileSync(target, JSON.stringify(evidence, null, 2));
const server = createRuntimeAgentRouter({ lookup: createServiceLookup() });
server.on('request', (req, res) => {
  const path = req.url.replace(/^\/[^/]+/, '');

  if (path === '/packages/v1/capabilities') {
    evidence.capabilityRequests++;
  }

  if (path === '/packages/v1/install' && req.method === 'POST') {
    evidence.installRequests++;
    res.once('finish', () => {
      evidence.installStatuses.push(res.statusCode);
      save();
    });
  }

  if (path === '/commands' && req.method === 'POST') {
    evidence.genericCommands++;
  }

  save();
});
server.listen(18081, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    save();
    server.close();
    server.closeAllConnections();
  });
}
