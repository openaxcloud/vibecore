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
