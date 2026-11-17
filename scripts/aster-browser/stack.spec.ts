import { recipeManifests } from '@recipe/private-runtime-recipe/manifests.js';
import { expect, it } from 'vitest';
import { browserStack } from './stack.js';

it('adds the real proxy with all ownership gates and changes no original manifests', () => {
  const name = 'vc-private-0123456789abcdef';
  const original = recipeManifests(name, 'local-password', 'agent-key', 'manager-key', 'jwt-key');
  const before = JSON.stringify(original);
  const result = browserStack(original, 'a'.repeat(64), 'b'.repeat(64));
  expect(JSON.stringify(original)).toBe(before);
  expect(result.every((r) => (r.kind === 'Namespace' ? r.metadata.name === name : ('namespace' in r.metadata && r.metadata.namespace === name)))).toBe(
    true,
  );
  expect(result.length).toBe(original.length + 2);

  const proxy = result.find((r) => r.kind === 'Deployment' && r.metadata.name === 'preview');
  const proxyPod = (proxy as { spec: { template: { spec: Record<string, unknown> } } }).spec.template.spec;
  expect(proxyPod.serviceAccountName).toBe('default');
  expect(proxyPod.automountServiceAccountToken).toBe(false);

  const container = (proxyPod.containers as Record<string, unknown>[])[0];
  expect(container.command).toEqual(['pnpm', '--filter', '@vibecore/preview-proxy', 'exec', 'tsx', 'src/server.ts']);
  expect(container.env).toEqual(
    expect.arrayContaining([
      { name: 'PREVIEW_PROXY_ENFORCE_TENANT', value: 'true' },
      { name: 'PREVIEW_ENFORCE_PRIVATE_PORTS', value: 'true' },
      { name: 'WORKSPACE_MANAGER_URL', value: 'http://manager:3010' },
      { name: 'API_BASE_URL', value: 'http://api:3001' },
    ]),
  );
  expect(container.envFrom).toEqual([{ secretRef: { name: 'local-credentials' } }]);
  expect(container.imagePullPolicy).toBe('Never');
  expect(JSON.stringify(result)).toContain('WORKSPACE_MANAGER_ENFORCE_PREVIEW_TENANT');
  expect(result.filter((r) => r.kind === 'PersistentVolumeClaim')).toEqual(
    original.filter((r) => r.kind === 'PersistentVolumeClaim'),
  );
  expect(() => browserStack(original, 'bad', 'b'.repeat(64))).toThrow();
  expect(() => browserStack(original, 'a'.repeat(64), 'a'.repeat(64))).toThrow();
});
