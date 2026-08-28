import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import {
  buildServerRollbackRuntimeSpec,
  parseServerRollbackRuntimeSpec,
  rollbackManifestKeyring,
  type RollbackManifestKeyring,
} from '../deterministic-rollback.js';
import { TestApiStore } from './test-api-store.js';

const ENVIRONMENT_KEYS = [
  'CONFIG_ENCRYPTION_KEY',
  'RESERVED_VM_RUNTIME_ENABLED',
  'ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON',
  'ROLLBACK_MANIFEST_ENCRYPTION_KEY',
  'ROLLBACK_MANIFEST_ENCRYPTION_KEY_ID',
  'WORKSPACE_MANAGER_URL',
] as const;

describe('deterministic rollback keyring boot validation', () => {
  const previousEnvironment = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of ENVIRONMENT_KEYS) delete process.env[key];
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.vibecore.svc:3010';
  });

  afterEach(() => {
    for (const key of ENVIRONMENT_KEYS) {
      const value = previousEnvironment[key];

      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const bootProductionApi = () =>
    buildApiApp({
      store: new TestApiStore(),
      isProduction: true,
      allowedOrigins: ['https://app.example.test'],
    });

  it('fails production boot when neither the dedicated nor rollout-compatible key exists', async () => {
    await expect(bootProductionApi()).rejects.toMatchObject({
      code: 'ROLLBACK_MANIFEST_KEYRING_INVALID',
    });
  });

  it.each([
    ['weak fallback', { CONFIG_ENCRYPTION_KEY: 'too-short' }],
    ['CONFIG development default', { CONFIG_ENCRYPTION_KEY: 'dev-config-encryption-key-change-me' }],
    ['rollback development default', { ROLLBACK_MANIFEST_ENCRYPTION_KEY: 'dev-rollback-manifest-key-change-me' }],
  ])('fails production boot for a %s', async (_label, environment) => {
    Object.assign(process.env, environment);

    await expect(bootProductionApi()).rejects.toMatchObject({
      code: 'ROLLBACK_MANIFEST_KEYRING_INVALID',
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['array', JSON.stringify(['not-a-keyring'])],
    ['weak old key', JSON.stringify({ 'rollback-old': 'weak' })],
    ['invalid old key id', JSON.stringify({ 'not a key id': 'o'.repeat(40) })],
  ])('fails production boot for a %s historical decrypt keyring', async (_label, previousKeys) => {
    process.env.CONFIG_ENCRYPTION_KEY = 'c'.repeat(40);
    process.env.ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON = previousKeys;

    await expect(bootProductionApi()).rejects.toMatchObject({
      code: 'ROLLBACK_MANIFEST_KEYRING_INVALID',
    });
  });

  it('decrypts old envelopes after rotation and encrypts new envelopes only with the new current key', async () => {
    const oldKeyring: RollbackManifestKeyring = {
      currentId: 'rollback-old',
      keys: new Map([['rollback-old', 'o'.repeat(40)]]),
    };
    const oldEnvelope = buildRuntimeEnvelope(oldKeyring, 'old-value');

    process.env.ROLLBACK_MANIFEST_ENCRYPTION_KEY_ID = 'rollback-new';
    process.env.ROLLBACK_MANIFEST_ENCRYPTION_KEY = 'n'.repeat(40);
    process.env.ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON = JSON.stringify({
      'rollback-old': 'o'.repeat(40),
    });

    const app = await bootProductionApi();
    const rotated = rollbackManifestKeyring({ production: true });

    expect(rotated.currentId).toBe('rollback-new');
    expect([...rotated.keys.keys()]).toEqual(['rollback-new', 'rollback-old']);
    expect(parseServerRollbackRuntimeSpec(oldEnvelope, rotated).envOverrides).toEqual({
      ROTATION_VALUE: 'old-value',
    });

    const newEnvelope = buildRuntimeEnvelope(rotated, 'new-value');
    expect(newEnvelope.envOverrides.keyId).toBe('rollback-new');
    expect(parseServerRollbackRuntimeSpec(newEnvelope, rotated).envOverrides).toEqual({
      ROTATION_VALUE: 'new-value',
    });
    await app.close();
  });
});

function buildRuntimeEnvelope(keyring: RollbackManifestKeyring, value: string) {
  return buildServerRollbackRuntimeSpec({
    organizationId: 'org-keyring-boot',
    projectId: 'project-keyring-boot',
    environment: 'preview',
    projectManifestDigest: `sha256:${'a'.repeat(64)}`,
    planEntitlements: {
      version: PLAN_ENTITLEMENTS_VERSION,
      plan: 'pro',
      badgeRequired: false,
      publishRegion: 'platform-default',
      publishRegions: 'all',
    },
    accessPolicyVersion: 1,
    machine: {
      key: 'shared-0.5',
      rateCardVersion: 1,
      cpuMillicores: 500,
      memoryMb: 1_024,
    },
    port: 3_000,
    healthPath: '/health',
    envOverrides: { ROTATION_VALUE: value },
    database: { mode: 'none' },
    keyring,
  });
}
