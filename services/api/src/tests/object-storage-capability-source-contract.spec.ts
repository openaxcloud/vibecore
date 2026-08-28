import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function productionTypescriptFiles(directory = srcRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'tests' ? [] : productionTypescriptFiles(path);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function signedUrlCallInventory() {
  const calls: string[] = [];

  for (const path of productionTypescriptFiles()) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\.create(Upload|Download)Url\s*\(/g)) {
      calls.push(`${relative(srcRoot, path)}:create${match[1]}Url`);
    }
  }

  return calls.sort();
}

describe('object-storage signed capability source contract', () => {
  it('fails when a new signed-URL emitter bypasses the tenant capability wrappers', () => {
    expect(signedUrlCallInventory()).toEqual(
      [
        'app.ts:createUploadUrl',
        'app.ts:createUploadUrl',
        'app.ts:createUploadUrl',
        'app.ts:createDownloadUrl',
        'app.ts:createDownloadUrl',
        'app.ts:createDownloadUrl',
        'object-storage.ts:createUploadUrl',
        'object-storage.ts:createDownloadUrl',
        'server-deploy-transfer.ts:createUploadUrl',
        'server-deploy-transfer.ts:createUploadUrl',
        'server-deploy-transfer.ts:createDownloadUrl',
        'server-deploy-revision.ts:createUploadUrl',
        'server-deploy-revision.ts:createDownloadUrl',
      ].sort(),
    );

    const app = readFileSync(resolve(srcRoot, 'app.ts'), 'utf8');
    expect(app).toContain('return tenantObjectStorageForProject(project);');
    expect(app).toContain('store.issueSignedObjectStorageCapability(');
    expect(app).toContain('store.issueSignedObjectStorageCapabilityWithinPhysicalAccess(');

    /* server-deploy-transfer/revision receive only the tenant-scoped proxy. */
    for (const call of [
      'buildImageContextFromRevision({',
      'snapshotWorkspaceImageContext({',
      'snapshotWorkspaceAppSource({',
    ]) {
      const start = app.indexOf(call);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(app.slice(start, start + 600)).toContain('objectStorage,');
    }
  });
});
