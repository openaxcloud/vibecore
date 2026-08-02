import { describe, expect, it } from 'vitest';
import {
  activeNixGeneration,
  assertNixGenerationUsable,
  nixGenerationRegistryFromEnv,
  parseNixGenerationRegistry,
  type NixGeneration,
} from './nix-generations';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

const gen = (over: Partial<NixGeneration> = {}): NixGeneration => ({
  id: 'gen-2',
  status: 'ACTIVE',
  catalogSha256: HASH_A,
  nixVersion: '2.34.8',
  nixpkgs: { channel: 'nixos-26.05', rev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3' },
  zones: { 'europe-west9-a': 'nix-store-v2-pvc', 'europe-west9-b': 'nix-store-v2-b-pvc' },
  bundles: [{ name: 'python312', storePath: '/nix/store/abc-env-python', sha256: 'f'.repeat(64) }],
  publishedAt: '2026-07-15T15:43:48Z',
  ...over,
});

const registryJson = (generations: NixGeneration[]) => JSON.stringify({ schemaVersion: 1, generations });

describe('parseNixGenerationRegistry', () => {
  it('accepts a valid rotation document (ACTIVE + RETIRED retention)', () => {
    const registry = parseNixGenerationRegistry(
      registryJson([
        gen(),
        gen({ id: 'gen-1', status: 'RETIRED', catalogSha256: HASH_B, retiredAt: '2026-07-15T00:00:00Z' }),
      ]),
    );

    expect(registry.generations).toHaveLength(2);
    expect(activeNixGeneration(registry)?.id).toBe('gen-2');
  });

  // Tests négatifs — chaque invariant du contrat rejette explicitement.
  it.each([
    ['two ACTIVE generations', [gen(), gen({ id: 'gen-3', catalogSha256: HASH_B })], /exactly one/],
    ['duplicate ids', [gen(), gen({ status: 'RETIRED', retiredAt: 'x' })], /duplicate/],
    ['bad catalog hash', [gen({ catalogSha256: 'sha256:zz' })], /sha256/],
    ['REVOKED without reason', [gen({ status: 'REVOKED', revokedAt: '2026-07-16T00:00:00Z' })], /revokedReason/],
    ['RETIRED without retiredAt', [gen({ status: 'RETIRED' })], /retiredAt/],
    ['empty zones', [gen({ zones: {} })], /zones/],
    ['missing pins', [gen({ nixpkgs: { channel: '', rev: '' } })], /pins/],
  ])('rejects %s', (_label, generations, pattern) => {
    expect(() => parseNixGenerationRegistry(registryJson(generations as NixGeneration[]))).toThrow(pattern);
  });

  it('rejects non-JSON and wrong schemaVersion', () => {
    expect(() => parseNixGenerationRegistry('not json')).toThrow(/not valid JSON/);
    expect(() => parseNixGenerationRegistry(JSON.stringify({ schemaVersion: 2, generations: [gen()] }))).toThrow(
      /schemaVersion/,
    );
  });
});

describe('assertNixGenerationUsable (revocation gate)', () => {
  const registry = parseNixGenerationRegistry(
    registryJson([
      gen(),
      gen({
        id: 'gen-1',
        status: 'REVOKED',
        catalogSha256: HASH_B,
        revokedAt: '2026-07-16T00:00:00Z',
        revokedReason: 'clé de signature compromise (exercice)',
      }),
    ]),
  );

  it('resolves ACTIVE by id and by catalog hash', () => {
    expect(assertNixGenerationUsable(registry, 'gen-2').id).toBe('gen-2');
    expect(assertNixGenerationUsable(registry, HASH_A).id).toBe('gen-2');
  });

  it('REFUSES a REVOKED generation with the reason (never a silent fallback)', () => {
    expect(() => assertNixGenerationUsable(registry, 'gen-1')).toThrow(/REVOKED.*compromise/);

    try {
      assertNixGenerationUsable(registry, 'gen-1');
    } catch (error) {
      expect((error as { code: string }).code).toBe('NIX_GENERATION_REVOKED');
    }
  });

  it('REFUSES an unknown generation', () => {
    expect(() => assertNixGenerationUsable(registry, 'gen-99')).toThrow(/not in the generation registry/);
  });
});

describe('nixGenerationRegistryFromEnv', () => {
  it('is the kill switch: unset env ⇒ undefined; invalid env ⇒ loud throw', () => {
    expect(nixGenerationRegistryFromEnv({})).toBeUndefined();
    expect(nixGenerationRegistryFromEnv({ NIX_STORE_GENERATIONS: '  ' })).toBeUndefined();
    expect(() => nixGenerationRegistryFromEnv({ NIX_STORE_GENERATIONS: '{broken' })).toThrow(/not valid JSON/);
    expect(nixGenerationRegistryFromEnv({ NIX_STORE_GENERATIONS: registryJson([gen()]) })?.generations).toHaveLength(1);
  });
});
