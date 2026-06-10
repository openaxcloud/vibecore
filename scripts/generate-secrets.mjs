#!/usr/bin/env node
// Generate the random secrets required by the production validator.
// Outputs KEY=VALUE lines to stdout so the operator can pipe them into a secret
// manager. Never write these to a committed file.

import { randomBytes } from 'node:crypto';

const keys = [
  { name: 'JWT_SECRET', bytes: 64 },
  { name: 'COOKIE_SECRET', bytes: 64 },
  { name: 'CONFIG_ENCRYPTION_KEY', bytes: 32 },
  { name: 'WORKSPACE_AGENT_TOKEN_SECRET', bytes: 64 },
  // Dedicated control-plane secret for api↔workspace-manager. Must be DISTINCT
  // from PREVIEW_PROXY_SHARED_SECRET (the manager no longer falls back to it),
  // so re-provisioning must include this key or the control plane fails closed.
  { name: 'WORKSPACE_MANAGER_SHARED_SECRET', bytes: 48 },
  { name: 'BACKUP_ENCRYPTION_KEY', bytes: 32 },
  { name: 'SIEM_SIGNING_SECRET', bytes: 32 },
];

const args = new Set(process.argv.slice(2));
const json = args.has('--json');

const generated = Object.fromEntries(keys.map(({ name, bytes }) => [name, randomBytes(bytes).toString('hex')]));

if (json) {
  process.stdout.write(`${JSON.stringify(generated, null, 2)}\n`);
} else {
  for (const [name, value] of Object.entries(generated)) {
    process.stdout.write(`${name}=${value}\n`);
  }
}
