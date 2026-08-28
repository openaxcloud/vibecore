import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDirectory = resolve(process.cwd(), 'packages/database/prisma/migrations');

/* These prefixes predate the monotonic naming policy and have already shipped.
 * Renaming an applied Prisma migration would corrupt migration history, so the
 * validator freezes their exact directory sets while rejecting every new
 * duplicate. */
const immutableLegacyDuplicates = new Map([
  ['0015', ['0015_integrations_connectors', '0015_workspace_runtime_state']],
  ['0062', ['0062_mcp_global_kill_switch', '0062_security_event_resolutions']],
  ['0063', ['0063_env_var_scope', '0063_project_slug_redirects']],
  [
    '0081',
    ['0081_project_checkpoint', '0081_remix_license_spdx_consent_trace', '0081_workspace_readiness_diagnostics'],
  ],
  ['0082', ['0082_notification_i18n_descriptor', '0082_release_manifest']],
  ['0083', ['0083_account_lockout', '0083_mcp_catalog_i18n', '0083_session_idle_timeout']],
]);

function sameNames(actual, expected) {
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

const entries = await readdir(migrationsDirectory, { withFileTypes: true });
const migrationNames = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

const invalidNames = migrationNames.filter((name) => !/^\d{4}_[a-z0-9][a-z0-9_]*$/u.test(name));
if (invalidNames.length > 0) {
  throw new Error(`Invalid Prisma migration directory name(s): ${invalidNames.join(', ')}`);
}

const missingSql = [];
for (const name of migrationNames) {
  try {
    const migration = await stat(resolve(migrationsDirectory, name, 'migration.sql'));
    if (!migration.isFile()) missingSql.push(name);
  } catch {
    missingSql.push(name);
  }
}
if (missingSql.length > 0) {
  throw new Error(`Prisma migration(s) without migration.sql: ${missingSql.join(', ')}`);
}

const byPrefix = new Map();
for (const name of migrationNames) {
  const prefix = name.slice(0, 4);
  const group = byPrefix.get(prefix) ?? [];
  group.push(name);
  byPrefix.set(prefix, group);
}

const unexpectedDuplicates = [];
for (const [prefix, names] of byPrefix) {
  if (names.length < 2) continue;
  const allowed = immutableLegacyDuplicates.get(prefix);
  if (!allowed || !sameNames(names, allowed)) {
    unexpectedDuplicates.push(`${prefix}: ${names.join(', ')}`);
  }
}
if (unexpectedDuplicates.length > 0) {
  throw new Error(
    `Duplicate Prisma migration prefixes are forbidden outside the frozen legacy allowlist:\n${unexpectedDuplicates.join('\n')}`,
  );
}

for (const [prefix, expected] of immutableLegacyDuplicates) {
  const actual = byPrefix.get(prefix) ?? [];
  if (!sameNames(actual, expected)) {
    throw new Error(
      `Applied legacy migration group ${prefix} changed. Expected ${expected.join(', ')}; received ${actual.join(', ')}`,
    );
  }
}

console.log(`Validated ${migrationNames.length} Prisma migrations; all new numeric prefixes are unique.`);
