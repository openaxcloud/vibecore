import { describe, expect, it } from 'vitest';
import {
  assertLockAgainstRegistry,
  buildEcodeLock,
  parseEcodeLock,
  serializeEcodeLock,
} from './ecode-lock';
import { parseNixGenerationRegistry, type NixGeneration } from './nix-generations';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const REV = '8eeec934ae0dbeca3d7868c059568a65c08b2fc3';

const gen = (over: Partial<NixGeneration> = {}): NixGeneration => ({
  id: 'gen-2',
  status: 'ACTIVE',
  catalogSha256: HASH_A,
  nixVersion: '2.34.8',
  nixpkgs: { channel: 'nixos-26.05', rev: REV },
  zones: { 'europe-west9-a': 'nix-store-v2-pvc' },
  bundles: [
    { name: 'python312', storePath: '/nix/store/aaa-env-python', sha256: 'c'.repeat(64) },
    { name: 'nodejs22', storePath: '/nix/store/bbb-env-node', sha256: 'd'.repeat(64) },
  ],
  publishedAt: '2026-07-15T15:43:48Z',
  ...over,
});

const registry = (generations: NixGeneration[]) =>
  parseNixGenerationRegistry(JSON.stringify({ schemaVersion: 1, generations }));

describe('buildEcodeLock + serializeEcodeLock', () => {
  it('is canonical: bundles sorted, stable keys, trailing newline — same env ⇒ same bytes', () => {
    const a = serializeEcodeLock(buildEcodeLock(gen()));
    const b = serializeEcodeLock(buildEcodeLock(gen()));

    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);

    const parsed = parseEcodeLock(a);
    expect(parsed.bundles.map((x) => x.name)).toEqual(['nodejs22', 'python312']);
    expect(parsed.storeGeneration).toBe('gen-2');
    expect(parsed.nixpkgsRev).toBe(REV);
  });

  it('locks a subset of bundles, refuses an unknown bundle', () => {
    expect(buildEcodeLock(gen(), ['python312']).bundles.map((b) => b.name)).toEqual(['python312']);
    expect(() => buildEcodeLock(gen(), ['ghc'])).toThrow(/no bundle "ghc"/);
  });
});

describe('parseEcodeLock (schema v1, strict)', () => {
  it.each([
    ['unknown root property', { lockVersion: 1, storeGeneration: 'g', nixpkgsRev: 'r', bundles: [], extra: 1 }, /unknown property "extra"/],
    ['wrong lockVersion', { lockVersion: 2, storeGeneration: 'g', nixpkgsRev: 'r', bundles: [{}] }, /lockVersion/],
    ['empty bundles', { lockVersion: 1, storeGeneration: 'g', nixpkgsRev: 'r', bundles: [] }, /non-empty array/],
    [
      'bad store path',
      { lockVersion: 1, storeGeneration: 'g', nixpkgsRev: 'r', bundles: [{ name: 'x', storePath: '/tmp/evil', sha256: 'e'.repeat(64) }] },
      /\/nix\/store\//,
    ],
    [
      'duplicate bundle',
      {
        lockVersion: 1,
        storeGeneration: 'g',
        nixpkgsRev: 'r',
        bundles: [
          { name: 'x', storePath: '/nix/store/a', sha256: 'e'.repeat(64) },
          { name: 'x', storePath: '/nix/store/b', sha256: 'e'.repeat(64) },
        ],
      },
      /duplicate bundle/,
    ],
    [
      'bundle unknown property',
      { lockVersion: 1, storeGeneration: 'g', nixpkgsRev: 'r', bundles: [{ name: 'x', storePath: '/nix/store/a', sha256: 'e'.repeat(64), evil: 1 }] },
      /unknown property "evil"/,
    ],
  ])('rejects %s', (_label, doc, pattern) => {
    expect(() => parseEcodeLock(JSON.stringify(doc))).toThrow(pattern);
  });

  it('rejects non-JSON', () => {
    expect(() => parseEcodeLock('{oops')).toThrow(/not valid JSON/);
  });
});

describe('assertLockAgainstRegistry (enforcement)', () => {
  const reg = registry([
    gen(),
    gen({
      id: 'gen-1',
      status: 'REVOKED',
      catalogSha256: HASH_B,
      revokedAt: '2026-07-16T00:00:00Z',
      revokedReason: 'génération empoisonnée (exercice)',
    }),
  ]);

  it('honours a lock pinning a usable generation', () => {
    const lock = buildEcodeLock(gen());
    expect(assertLockAgainstRegistry(lock, reg).id).toBe('gen-2');
  });

  it('REFUSES a lock pinning a REVOKED generation (typed, with reason)', () => {
    const lock = { ...buildEcodeLock(gen()), storeGeneration: 'gen-1' };

    try {
      assertLockAgainstRegistry(lock, reg);
      expect.unreachable('must throw');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ECODE_LOCK_GENERATION_REVOKED');
      expect((error as Error).message).toMatch(/empoisonnée/);
    }
  });

  it('REFUSES a lock pinning an unknown generation', () => {
    const lock = { ...buildEcodeLock(gen()), storeGeneration: 'gen-77' };
    expect(() => assertLockAgainstRegistry(lock, reg)).toThrow(/unknown store generation/);
  });

  it('REFUSES a nixpkgs pin drifted from the generation (no silent divergence)', () => {
    const lock = { ...buildEcodeLock(gen()), nixpkgsRev: 'deadbeef' };

    try {
      assertLockAgainstRegistry(lock, reg);
      expect.unreachable('must throw');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ECODE_LOCK_NIXPKGS_MISMATCH');
    }
  });
});
