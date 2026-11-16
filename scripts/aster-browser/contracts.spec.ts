import { describe, expect, it } from 'vitest';
import {
  baseSha,
  validateDescriptor,
  validateProviderAbsent,
  validateReceipt,
  type Descriptor,
  type Receipt,
  type Request,
} from './contracts.js';

const descriptor: Descriptor = {
  sourceSha: baseSha,
  runId: 'a'.repeat(32),
  cluster: 'vc-private-0123456789abcdef',
  origin: 'http://127.0.0.1:5173',
};

const expected = { podUid: 'pod-old', pvcUid: 'pvc-old', resourceVersion: '8', hashes: {} };
const request: Request = { action: 'replace-empty', projectId: 'p', workspaceId: 'w', expected };

const replaced = {
  oldPvcUid: 'pvc-old',
  newPvcUid: 'pvc-new',
  emptyEntries: [],
  stoppedPodUid: 'pod-old',
  conditionalDelete: { uid: 'pvc-old', resourceVersion: '8' },
};
const receipt: Receipt = {
  ...request,
  status: 'ok',
  requestId: 'request-1',
  runId: descriptor.runId,
  cluster: descriptor.cluster,
  replaced,
};
describe('browser/host IPC contracts — synthetic unit values, not runtime evidence', () => {
  it('accepts only the exact source and one local origin', () => {
    expect(() => validateDescriptor(descriptor)).not.toThrow();

    for (const origin of [
      'https://production.example',
      'http://localhost:5173',
      'http://127.0.0.1:5173/path',
      'http://user@127.0.0.1:5173',
    ]) {
      expect(() => validateDescriptor({ ...descriptor, origin })).toThrow();
    }
    expect(() => validateDescriptor({ ...descriptor, sourceSha: 'different' })).toThrow();
  });
  it('requires the provider-absent mode and no configured provider credential', () => {
    expect(() => validateProviderAbsent({ E2E_PROVIDER_MODE: 'absent' })).not.toThrow();
    expect(() => validateProviderAbsent({ E2E_PROVIDER_MODE: 'required' })).toThrow();
    expect(() => validateProviderAbsent({ E2E_PROVIDER_MODE: 'absent', OPENAI_API_KEY: 'synthetic-value' })).toThrow();
  });
  it('rejects wrong run, request, cluster, project and workspace bindings', () => {
    expect(() => validateReceipt(receipt, request, descriptor, 'request-1')).not.toThrow();

    for (const key of ['runId', 'requestId', 'cluster', 'projectId', 'workspaceId', 'action']) {
      expect(() => validateReceipt({ ...receipt, [key]: 'different' }, request, descriptor, 'request-1')).toThrow();
    }
  });
  it('rejects a reused or nonempty volume and a deletion without exact fencing', () => {
    for (const replaced of [
      { ...receipt.replaced!, newPvcUid: 'pvc-old' },
      { ...receipt.replaced!, emptyEntries: ['package.json'] },
      { ...receipt.replaced!, stoppedPodUid: 'different' },
      { ...receipt.replaced!, conditionalDelete: { uid: 'pvc-old', resourceVersion: '9' } },
    ]) {
      expect(() => validateReceipt({ ...receipt, replaced }, request, descriptor, 'request-1')).toThrow();
    }
  });
});
