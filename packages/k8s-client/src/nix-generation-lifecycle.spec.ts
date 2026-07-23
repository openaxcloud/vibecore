/*
 * CTR-RUNTIME-NIX — REPLAYABLE lifecycle proof (rotation + révocation).
 *
 * This suite replays the full generation lifecycle against the REAL production
 * registry document (infra/helm/platform/values-prod.yaml → gen-2, whose
 * catalogSha256/bundle hashes were read off the LIVE store disk on
 * 2026-07-22): publish a new generation, activate it (rotation), keep the old
 * one readable (retention), then revoke it and verify every path REFUSES it.
 * Replay: `pnpm --filter @vibecore/k8s-client test -- nix-generation-lifecycle`.
 *
 * The end-to-end variant through a live Publish (URL → typed failure) is
 * BLOCKED on deploying this code (the running manager does not read
 * NIX_STORE_GENERATIONS yet) — declared in RUNTIME_NIX_CONTRACT.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertLockAgainstRegistry,
  assertLockPublishable,
  buildEcodeLock,
  parseEcodeLock,
  serializeEcodeLock,
} from './ecode-lock';
import {
  activeNixGeneration,
  assertNixGenerationUsable,
  parseNixGenerationRegistry,
  type NixGeneration,
} from './nix-generations';

function prodRegistryJson(): string {
  const valuesProd = readFileSync(
    join(__dirname, '..', '..', '..', 'infra', 'helm', 'platform', 'values-prod.yaml'),
    'utf8',
  );
  const match = /nixGenerations: '(\{.+\})'/.exec(valuesProd);

  if (!match) {
    throw new Error('values-prod.yaml no longer carries platformEnv.runtime.nixGenerations');
  }

  return match[1].replaceAll("''", "'");
}

describe('CTR-RUNTIME-NIX lifecycle (real prod registry document)', () => {
  it('the production registry parses and gen-2 is ACTIVE with live-read hashes', () => {
    const registry = parseNixGenerationRegistry(prodRegistryJson());
    const active = activeNixGeneration(registry);

    expect(active?.id).toBe('gen-2');
    expect(active?.catalogSha256).toBe('sha256:3029b5810ba485844f1029132f3f00652075e1e2c0cbb454992d3a94aa8fd5d5');
    expect(active?.zones).toEqual({
      'europe-west9-a': 'nix-store-v2-pvc',
      'europe-west9-b': 'nix-store-v2-b-pvc',
    });
    expect(active?.bundles.map((bundle) => bundle.name).sort()).toEqual(['go', 'nodejs22', 'python312']);
  });

  it('point 1 — a lock built from the real gen-2 is concretely pinned and publishable', () => {
    const gen2 = activeNixGeneration(parseNixGenerationRegistry(prodRegistryJson()))!;
    const lock = parseEcodeLock(serializeEcodeLock(buildEcodeLock(gen2)));

    expect(lock.storeGeneration).toBe('gen-2');
    expect(() => assertLockPublishable(lock)).not.toThrow();
    // A mutable alias in the same lock is refused — not really pinned.
    expect(() => assertLockPublishable({ ...lock, storeGeneration: 'active' })).toThrow(/UNPINNED|concrete/i);
  });

  it('point 3 — exhaustive catalog binding: a tampered bundle hash/path is refused against the real gen-2', () => {
    const registry = parseNixGenerationRegistry(prodRegistryJson());
    const gen2 = activeNixGeneration(registry)!;
    const good = buildEcodeLock(gen2);

    // Same generation + nixpkgs, but one bundle's sha256 flipped ⇒ refused.
    const tampered = { ...good, bundles: good.bundles.map((b, i) => (i === 0 ? { ...b, sha256: '0'.repeat(64) } : b)) };
    try {
      assertLockAgainstRegistry(tampered, registry);
      expect.unreachable('tampered bundle must be refused');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ECODE_LOCK_BUNDLE_TAMPERED');
    }

    // A bundle name the signed catalog never published ⇒ refused.
    const foreign = { ...good, bundles: [...good.bundles, { name: 'rustc', storePath: '/nix/store/x-rust', sha256: 'a'.repeat(64) }] };
    try {
      assertLockAgainstRegistry(foreign, registry);
      expect.unreachable('unknown bundle must be refused');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ECODE_LOCK_BUNDLE_UNKNOWN');
    }

    // The untouched, catalog-matching lock passes.
    expect(assertLockAgainstRegistry(good, registry).id).toBe('gen-2');
  });

  it('rotation: gen-3 published + activated atomically; gen-2 retired but retained; locks keep working', () => {
    const base = parseNixGenerationRegistry(prodRegistryJson());
    const gen2 = activeNixGeneration(base)!;

    // A lock written under gen-2 (the real prod generation).
    const lockUnderGen2 = parseEcodeLock(serializeEcodeLock(buildEcodeLock(gen2, ['python312'])));

    const gen3: NixGeneration = {
      id: 'gen-3',
      status: 'ACTIVE',
      catalogSha256: `sha256:${'3'.repeat(64)}`,
      nixVersion: '2.34.8',
      nixpkgs: gen2.nixpkgs,
      zones: { 'europe-west9-a': 'nix-store-v3-pvc' },
      bundles: gen2.bundles,
      publishedAt: '2026-07-22T00:00:00Z',
    };

    // ROTATION = one document edit: gen-3 ACTIVE, gen-2 RETIRED. Atomic by
    // construction (single parse validates the whole document or none of it).
    const rotated = parseNixGenerationRegistry(
      JSON.stringify({
        schemaVersion: 1,
        generations: [{ ...gen2, status: 'RETIRED', retiredAt: '2026-07-22T00:00:00Z' }, gen3],
      }),
    );

    expect(activeNixGeneration(rotated)?.id).toBe('gen-3');

    // Retention N-1: the gen-2 lock still resolves to gen-2 (its own zones+hash).
    expect(assertLockAgainstRegistry(lockUnderGen2, rotated).id).toBe('gen-2');
    expect(assertNixGenerationUsable(rotated, 'gen-2').catalogSha256).toBe(gen2.catalogSha256);

    // Atomic activation invariant: a document with BOTH ACTIVE is rejected whole.
    expect(() =>
      parseNixGenerationRegistry(JSON.stringify({ schemaVersion: 1, generations: [gen2, gen3] })),
    ).toThrow(/exactly one/);
  });

  it('révocation: a revoked generation is refused by EVERY path, with the recorded reason', () => {
    const base = parseNixGenerationRegistry(prodRegistryJson());
    const gen2 = activeNixGeneration(base)!;
    const lockUnderGen2 = buildEcodeLock(gen2);

    const gen3: NixGeneration = {
      ...gen2,
      id: 'gen-3',
      catalogSha256: `sha256:${'3'.repeat(64)}`,
      zones: { 'europe-west9-a': 'nix-store-v3-pvc' },
      publishedAt: '2026-07-22T00:00:00Z',
    };

    const revoked = parseNixGenerationRegistry(
      JSON.stringify({
        schemaVersion: 1,
        generations: [
          {
            ...gen2,
            status: 'REVOKED',
            revokedAt: '2026-07-22T00:00:00Z',
            revokedReason: 'exercice: clé de signature du store compromise',
          },
          gen3,
        ],
      }),
    );

    // Resolution by id AND by drift hash both refuse.
    for (const ref of ['gen-2', gen2.catalogSha256]) {
      try {
        assertNixGenerationUsable(revoked, ref);
        expect.unreachable('revoked generation must be refused');
      } catch (error) {
        expect((error as { code: string }).code).toBe('NIX_GENERATION_REVOKED');
        expect((error as Error).message).toContain('compromise');
      }
    }

    // A lock pinning the revoked generation fails typed — never a fallback.
    try {
      assertLockAgainstRegistry(lockUnderGen2, revoked);
      expect.unreachable('lock on revoked generation must be refused');
    } catch (error) {
      expect((error as { code: string }).code).toBe('ECODE_LOCK_GENERATION_REVOKED');
    }

    // The replacement generation keeps working.
    expect(assertNixGenerationUsable(revoked, 'gen-3').id).toBe('gen-3');
  });
});
