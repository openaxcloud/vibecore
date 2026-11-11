import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { scanSource } from './source-scanner.mjs';

// These exceptions may only be retired after their source debt is removed.
const retired = [
  {
    id: 'dormant-workspace-sdk-client-diagnostic',
    path: 'packages/workspace-sdk/src/index.ts',
    rule: 'error-message',
    textPattern: '^Workspace agent request failed: \\{…\\}$',
  },
  {
    id: 'dormant-mobile-biometric-reasons',
    path: 'apps/mobile/src/biometric.ts',
    rule: 'visible-object-copy',
    textPattern: '^(?:unsupported|cancelled|failed)$',
  },
  {
    id: 'skill-audit-proof-cli-diagnostics',
    path: 'services/api/scripts/skill-audit-proof.ts',
    rule: 'error-message',
    textPattern: '^(?:real skill failed to parse: \\{…\\}|fixture failed to parse: \\{…\\})$',
  },
  {
    id: 'dormant-deployment-provider-guard',
    path: 'services/api/src/deployments.ts',
    rule: 'error-message',
    textPattern: '^Deployment provider "\\{…\\}" is not configured for production use$',
  },
  {
    id: 'dormant-api-skill-disclosure-invariants',
    path: 'services/api/src/skill-disclosure.ts',
    rule: 'error-message',
    textPattern: '^(?:Unknown skill "\\{…\\}"\\.|Skill "\\{…\\}" declares no resource "\\{…\\}"\\.)$',
  },
  {
    id: 'dormant-agent-auto-accept-decisions',
    path: 'app/utils/agent-auto-accept.ts',
    rule: 'visible-object-copy',
    textPattern:
      '^(?:Auto-accept is disabled\\.|\\{…\\} diagnostic error\\(s\\) must be fixed first\\.|Run a real test command before auto-accept can apply all proposals\\.|Run tests again after the latest AI proposal before auto-accept can continue\\.|Latest test run is \\{…\\}\\.|Latest test run passed\\.)$',
  },
  {
    id: 'dormant-lifecycle-state-machine-diagnostics',
    path: 'services/api/src/lifecycle-state-machines.ts',
    rule: 'visible-object-copy',
    textPattern:
      '^(?:no components|\\{…\\} component snapshot\\(s\\) unverified|components snapshotted under different logical barriers \\(not the same instant\\)|promotion \\{…\\} is \\{…\\}, not PROMOTION_COMMITTED — an incomplete promotion can never become a release|\\{…\\} attachment\\(s\\) not relinked into the tenant repo|Binary Authorization is \\{…\\}, not PASSED)$',
  },
  {
    id: 'dormant-capacity-policy-estimates',
    path: 'services/api/src/capacity-policy.ts',
    rule: 'visible-object-copy',
    textPattern:
      '^(?:folder-per-tenant needs \\{…\\} min of pure folder-creation rate-limit|folder-per-tenant disabled by policy \\(default\\); enable only on a measured contractual requirement)$',
  },
];

describe('expired exemptions retired through source fixes', () => {
  it.each(retired)('$id has no exempted source debt', async (entry) => {
    const allowlist = JSON.parse(await readFile('scripts/i18n/source-allowlist.json', 'utf8'));
    expect(allowlist.entries.some(({ id }) => id === entry.id)).toBe(false);

    if (entry.id === 'dormant-agent-auto-accept-decisions') {
      await expect(readFile(entry.path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      return;
    }

    const scan = scanSource(await readFile(entry.path, 'utf8'), entry.path);
    expect(scan.parseErrors).toEqual([]);

    const pattern = new RegExp(entry.textPattern);
    expect(scan.findings.filter(({ rule, text }) => rule === entry.rule && pattern.test(text))).toEqual([]);
  });
});
