import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { recordStatus } from './diagnostics.mjs';
import { createRuntimeAgentRouter, createServiceLookup } from './upstream/runtime-agent-router.mjs';

export function createTransportEvidence() {
  return {
    capabilityRequests: 0,
    capabilityStatuses: [],
    installRequests: 0,
    installStatuses: [],
    genericCommands: 0,
  };
}

export function observeRequest(req, res, evidence, save) {
  const path = req.url.replace(/^\/[^/]+/, '');

  if (path === '/packages/v1/capabilities') {
    evidence.capabilityRequests++;
    res.once('finish', () => {
      recordStatus(evidence.capabilityStatuses, res.statusCode);
      save();
    });
  }

  if (path === '/packages/v1/install' && req.method === 'POST') {
    evidence.installRequests++;
    res.once('finish', () => {
      recordStatus(evidence.installStatuses, res.statusCode);
      save();
    });
  }

  if (path === '/commands/run' && req.method === 'POST') {
    evidence.genericCommands++;
  }

  save();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = createTransportEvidence();
  const target = `${process.env.EVIDENCE_DIR}/transport.json`;
  const save = () => writeFileSync(target, JSON.stringify(evidence, null, 2));
  const server = createRuntimeAgentRouter({ lookup: createServiceLookup() });
  server.on('request', (req, res) => observeRequest(req, res, evidence, save));
  server.listen(18081, '127.0.0.1');

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      save();
      server.close();
      server.closeAllConnections();
    });
  }
}
