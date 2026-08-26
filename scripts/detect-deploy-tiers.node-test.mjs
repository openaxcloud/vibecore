import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectDeployTiers, parseForcedTiers } from './detect-deploy-tiers.mjs';

const NONE = { runtime: false, web: false, admin: false, wsagent: false };

describe('continuous-deploy tier detection', () => {
  it('builds only admin for an isolated admin source change', () => {
    assert.deepEqual(detectDeployTiers(['apps/admin/src/main.tsx']), { ...NONE, admin: true });
  });

  it('builds web and admin for their exact shared i18n inputs', () => {
    assert.deepEqual(detectDeployTiers(['app/lib/i18n/catalogs/admin.ts']), {
      ...NONE,
      web: true,
      admin: true,
    });
    assert.deepEqual(detectDeployTiers(['app/lib/i18n/language.ts']), {
      ...NONE,
      web: true,
      admin: true,
    });
  });

  it('does not rebuild admin for unrelated web source', () => {
    assert.deepEqual(detectDeployTiers(['app/routes/_index.tsx']), { ...NONE, web: true });
  });

  it('rebuilds runtime and admin for their shared node-service Dockerfile', () => {
    assert.deepEqual(detectDeployTiers(['infra/docker/node-service.Dockerfile']), {
      ...NONE,
      runtime: true,
      admin: true,
    });
  });

  it('rebuilds deps consumers, but not workspace-agent, for the deps Dockerfile', () => {
    assert.deepEqual(detectDeployTiers(['infra/docker/deps.Dockerfile']), {
      runtime: true,
      web: true,
      admin: true,
      wsagent: false,
    });
  });

  it('rebuilds all tiers for lockfile/shared-package and unknown production inputs', () => {
    const all = { runtime: true, web: true, admin: true, wsagent: true };

    assert.deepEqual(detectDeployTiers(['pnpm-lock.yaml']), all);
    assert.deepEqual(detectDeployTiers(['apps/admin/package.json']), all);
    assert.deepEqual(detectDeployTiers(['packages/security/src/index.ts']), all);
    assert.deepEqual(detectDeployTiers(['new-production-root/server.ts']), all);
  });

  it('applies chart-only changes without rebuilding an image', () => {
    assert.deepEqual(detectDeployTiers(['infra/helm/platform/templates/deployments.yaml']), NONE);
  });

  it('rebuilds all tiers when there is no trustworthy diff base', () => {
    assert.deepEqual(detectDeployTiers([], { hasBase: false }), {
      runtime: true,
      web: true,
      admin: true,
      wsagent: true,
    });
  });

  it('supports an admin-only forced validation and rejects unknown tier names', () => {
    assert.deepEqual(parseForcedTiers('admin'), { ...NONE, admin: true });
    assert.throws(() => parseForcedTiers('admin,garbage'), /Invalid force_tiers value/u);
  });
});
