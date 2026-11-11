import { describe, expect, it } from 'vitest';

import { appPublicCopy, appPublicEnglish, localizeAppPublicMessage, type AppPublicCopyKey } from './app-public-copy.js';
import { DEFAULT_CAPACITY_POLICY, estimateProvisioning } from './capacity-policy.js';
import { assertDeploymentProviderConfigured } from './deployments.js';
import {
  checkpointManifestVisible,
  releaseMayBeCut,
  type CheckpointComponentSnapshot,
  type PromotionManifest,
} from './lifecycle-state-machines.js';
import { SkillDisclosureSession } from './skill-disclosure.js';

const component: CheckpointComponentSnapshot = {
  componentKind: 'FILES',
  snapshotId: 'snapshot-1',
  logicalBarrierId: 'barrier-1',
  startedAt: '2026-11-08T00:00:00Z',
  consistencyLevel: 'crash-consistent',
  encryptionKeyVersion: 'key-1',
  restoreCompatibility: 'v1',
  verified: true,
};

const promotion: PromotionManifest = {
  promotionId: 'promotion-1',
  sourceRepo: 'source',
  sourceDigest: 'sha256:aaa',
  targetRepo: 'target',
  targetTenant: 'tenant-1',
  attachments: [],
  binaryAuthorizationResult: 'PASSED',
  state: 'PROMOTION_COMMITTED',
  preparedAt: '2026-11-08T00:00:00Z',
};

describe('retired API i18n exemptions', () => {
  it('preserves the English deployment error and routes both error forms through the French boundary', () => {
    let error: (Error & { code: string; statusCode: number; publicMessage: string; details: unknown }) | undefined;

    try {
      assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'production' });
    } catch (caught) {
      error = caught as typeof error;
    }

    expect(error).toMatchObject({
      message: 'Deployment provider "vercel" is not configured for production use',
      code: 'DEPLOYMENT_PROVIDER_NOT_CONFIGURED',
      statusCode: 503,
      details: { provider: 'vercel', missingEnv: ['VERCEL_DEPLOY_HOOK_URL'] },
    });
    expect(localizeAppPublicMessage(error!.message, 'fr')).toEqual({
      matched: true,
      value: 'Le fournisseur de déploiement « vercel » n’est pas configuré pour la production',
    });
    expect(localizeAppPublicMessage(error!.publicMessage, 'fr')).toEqual({
      matched: true,
      value: appPublicCopy('DEPLOY_PROVIDER_CONFIG_REQUIRED', 'fr', {
        provider: 'Vercel',
        missing: 'VERCEL_DEPLOY_HOOK_URL',
      }),
    });
  });

  it.each([
    ['SKILL_AUDIT_REAL_PARSE_FAILED', 'real skill failed to parse: invalid YAML'],
    ['SKILL_AUDIT_FIXTURE_PARSE_FAILED', 'fixture failed to parse: invalid YAML'],
  ] as const)('keeps the %s CLI contract and catalogues its French equivalent', (key, english) => {
    expect(appPublicEnglish(key, { errors: 'invalid YAML' })).toBe(english);
    expect(localizeAppPublicMessage(english, 'fr')).toEqual({
      matched: true,
      value: appPublicCopy(key, 'fr', { errors: 'invalid YAML' }),
    });
    expect(appPublicCopy(key, 'fr', { errors: 'invalid YAML' })).toMatch(/^Impossible d’analyser/);
  });

  it('localizes skill lookup failures without changing lazy loading or resource boundaries', () => {
    const skill = {
      name: 'example',
      description: 'example',
      resources: [],
      loadBody: () => 'body',
      loadResource: () => '',
    };

    const english = new SkillDisclosureSession([skill], () => 'now');
    const french = new SkillDisclosureSession([skill], () => 'now', 'fr');

    expect(() => english.open('missing')).toThrow('Unknown skill "missing".');
    expect(() => english.openResource('example', 'private.txt')).toThrow(
      'Skill "example" declares no resource "private.txt".',
    );
    expect(() => french.open('missing')).toThrow('Compétence « missing » inconnue.');
    expect(() => french.openResource('missing', 'private.txt')).toThrow('Compétence « missing » inconnue.');
    expect(() => french.openResource('example', 'private.txt')).toThrow(
      'La compétence « example » ne déclare aucune ressource « private.txt ».',
    );
    expect(french.trace()).toEqual([]);
    expect(french.open('example')).toBe('body');
  });

  it.each([
    [[], 'no components', 'aucun composant'],
    [
      [{ ...component, verified: false }],
      '1 component snapshot(s) unverified',
      '1 instantané(s) de composant non vérifié(s)',
    ],
    [
      [{ ...component, logicalBarrierId: 'other' }],
      'components snapshotted under different logical barriers (not the same instant)',
      'composants capturés sous des barrières logiques différentes (pas au même instant)',
    ],
  ] as const)('preserves checkpoint refusal and localizes its reason for %j', (components, english, french) => {
    expect(checkpointManifestVisible([...components], 'barrier-1')).toEqual({ visible: false, reason: english });
    expect(checkpointManifestVisible([...components], 'barrier-1', 'fr')).toEqual({ visible: false, reason: french });
    expect(localizeAppPublicMessage(english, 'fr')).toEqual({ matched: true, value: french });
    expect(checkpointManifestVisible([component], 'barrier-1', 'fr')).toEqual({ visible: true });
  });

  it.each([
    [
      { ...promotion, state: 'PROMOTION_TARGET_VERIFIED' as const },
      'promotion promotion-1 is PROMOTION_TARGET_VERIFIED, not PROMOTION_COMMITTED — an incomplete promotion can never become a release',
      'RELEASE_PROMOTION_INCOMPLETE',
      { promotionId: 'promotion-1', state: 'PROMOTION_TARGET_VERIFIED' },
    ],
    [
      {
        ...promotion,
        attachments: [{ type: 'sbom' as const, digest: 'sha256:b', subjectDigest: 'sha256:aaa', relinked: false }],
      },
      '1 attachment(s) not relinked into the tenant repo',
      'RELEASE_ATTACHMENTS_NOT_RELINKED',
      { count: 1 },
    ],
    [
      { ...promotion, binaryAuthorizationResult: 'UNKNOWN' as const },
      'Binary Authorization is UNKNOWN, not PASSED',
      'RELEASE_BINARY_AUTHORIZATION_NOT_PASSED',
      { result: 'UNKNOWN' },
    ],
  ] as const)('preserves release refusal and translates its reason', (input, english, key, values) => {
    const french = appPublicCopy(key as AppPublicCopyKey, 'fr', values);
    const manifest: PromotionManifest = { ...input, attachments: [...input.attachments] };
    expect(releaseMayBeCut(manifest)).toEqual({ allowed: false, reason: english });
    expect(releaseMayBeCut(manifest, 'fr')).toEqual({ allowed: false, reason: french });
    expect(localizeAppPublicMessage(english, 'fr')).toEqual({ matched: true, value: french });
    expect(french).not.toBe(english);
    expect(french).not.toMatch(/\{\w+\}/);
    expect(releaseMayBeCut(promotion, 'fr')).toEqual({ allowed: true });
  });

  it('localizes capacity explanations while preserving every numeric and policy decision', () => {
    for (const folderPerTenant of [false, true]) {
      const policy = { ...DEFAULT_CAPACITY_POLICY, folderPerTenant };
      const english = estimateProvisioning(1000, policy);
      const french = estimateProvisioning(1000, policy, 'fr');
      expect(french.sharded).toEqual(english.sharded);
      expect(french.folderPerTenant).toEqual({ ...english.folderPerTenant, reason: expect.any(String) });
      expect(french.folderPerTenant.reason).not.toBe(english.folderPerTenant.reason);
      expect(localizeAppPublicMessage(english.folderPerTenant.reason, 'fr')).toEqual({
        matched: true,
        value: french.folderPerTenant.reason,
      });
    }
    expect(
      estimateProvisioning(30, { ...DEFAULT_CAPACITY_POLICY, folderPerTenant: true }, 'fr').folderPerTenant,
    ).toEqual({
      folderCreates: 30,
      rateLimitedSeconds: 300,
      admissible: true,
      reason: undefined,
    });
  });
});
