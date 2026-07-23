import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceManager, type EventBus, type WorkspaceStore } from './manager.js';

/*
 * D3 multi-zone Nix store — the manager's placement resolver. Pins:
 *  - legacy behaviour with no zone map (single PVC through, no zone pin);
 *  - capacity-driven zone choice (cordoned zone-a ⇒ new pods get zone-b's clone);
 *  - one-off PVCs are NEVER silently rewritten to a different disk;
 *  - node-listing failure falls back to the first configured zone (no refusal).
 */

function node(zone: string, unschedulable = false): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: `node-${zone}-${unschedulable ? 'cordoned' : 'ok'}`,
      labels: { 'topology.kubernetes.io/zone': zone, 'vibecore.ai/node-pool': 'sandbox' },
    },
    spec: unschedulable ? { unschedulable: true } : {},
    status: { conditions: [{ type: 'Ready', status: 'True' }] },
  } as unknown as K8sObject;
}

class NodesOnlyK8sClient implements WorkspaceK8sClient {
  constructor(
    readonly nodes: K8sObject[],
    readonly failListing = false,
  ) {}

  async listByLabel(kind: string) {
    if (this.failListing) {
      throw new Error('RBAC: nodes is forbidden');
    }

    return kind === 'nodes' ? this.nodes : [];
  }

  // The resolver only lists nodes; everything else is out of scope here.
  async apply(object: K8sObject) {
    return object;
  }
  async delete() {}
  async get(): Promise<K8sObject | undefined> {
    return undefined;
  }
  async getPod(): Promise<K8sObject | undefined> {
    return undefined;
  }

  async *streamPodLogs(): AsyncIterable<string> {
    throw new Error('not used');
  }
  async scale() {}
  async annotate() {}
}

const ZONE_MAP = 'europe-west9-a=nix-store-v2-pvc,europe-west9-b=nix-store-v2-b-pvc';
const HASH = 'sha256:3029b5810ba485844f1029132f3f00652075e1e2c0cbb454992d3a94aa8fd5d5';

function makeManager(k8s: WorkspaceK8sClient) {
  const store = {
    create: async () => ({}),
    update: async () => ({}),
    get: async () => undefined,
    list: async () => [],
    listActive: async () => [],
  } as unknown as WorkspaceStore;

  const events = { publish: () => {} } as unknown as EventBus;

  return new WorkspaceManager(store, k8s, events, 'test-secret');
}

class PvcAwareK8sClient extends NodesOnlyK8sClient {
  constructor(
    nodes: K8sObject[],
    readonly objects: Record<string, K8sObject | undefined> = {},
  ) {
    super(nodes);
  }

  override async get(kind: string, _namespace: string, name: string): Promise<K8sObject | undefined> {
    return this.objects[`${kind}:${name}`];
  }
}

describe('workspaceDataZone', () => {
  it('reads the zone via the PVC selected-node annotation (no PV RBAC needed)', async () => {
    const k8s = new PvcAwareK8sClient([], {
      'pvc:pvc-ws1': {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'pvc-ws1', annotations: { 'volume.kubernetes.io/selected-node': 'node-b-1' } },
      } as unknown as K8sObject,
      'node:node-b-1': node('europe-west9-b'),
    });

    expect(await makeManager(k8s).workspaceDataZone('workspaces', 'pvc-ws1')).toBe('europe-west9-b');
  });

  it('falls back to the bound PV nodeAffinity when the annotation is absent', async () => {
    const k8s = new PvcAwareK8sClient([], {
      'pvc:pvc-ws1': {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'pvc-ws1' },
        spec: { volumeName: 'pv-1' },
      } as unknown as K8sObject,
      'pv:pv-1': {
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: { name: 'pv-1' },
        spec: {
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    { key: 'topology.kubernetes.io/zone', operator: 'In', values: ['europe-west9-b'] },
                  ],
                },
              ],
            },
          },
        },
      } as unknown as K8sObject,
    });

    expect(await makeManager(k8s).workspaceDataZone('workspaces', 'pvc-ws1')).toBe('europe-west9-b');
  });

  it('returns undefined for a fresh workspace (no PVC yet)', async () => {
    expect(await makeManager(new PvcAwareK8sClient([])).workspaceDataZone('workspaces', 'pvc-new')).toBeUndefined();
  });
});

describe('resolveNixStorePlacement (D3 multi-zone)', () => {
  const saved = {
    zones: process.env.NIX_STORE_PVC_ZONES,
    hash: process.env.NIX_STORE_GENERATION_HASH,
    single: process.env.NIX_STORE_PVC_NAME,
    registry: process.env.NIX_STORE_GENERATIONS,
  };

  afterEach(() => {
    for (const [key, value] of [
      ['NIX_STORE_PVC_ZONES', saved.zones],
      ['NIX_STORE_GENERATION_HASH', saved.hash],
      ['NIX_STORE_PVC_NAME', saved.single],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns {} when nothing requests the store', async () => {
    delete process.env.NIX_STORE_PVC_ZONES;
    delete process.env.NIX_STORE_PVC_NAME;
    expect(await makeManager(new NodesOnlyK8sClient([])).resolveNixStorePlacement(undefined)).toEqual({});
  });

  it('legacy: no zone map ⇒ requested PVC passes through, no zone pin, hash still armed', async () => {
    delete process.env.NIX_STORE_PVC_ZONES;
    process.env.NIX_STORE_GENERATION_HASH = HASH;

    expect(
      await makeManager(new NodesOnlyK8sClient([node('europe-west9-a')])).resolveNixStorePlacement('nix-store-v2-pvc'),
    ).toEqual({
      nixStorePvcName: 'nix-store-v2-pvc',
      nixStoreGenerationHash: HASH,
    });
  });

  it('picks the surviving zone when the preferred zone is cordoned (zone-a stockout)', async () => {
    process.env.NIX_STORE_PVC_ZONES = ZONE_MAP;
    process.env.NIX_STORE_GENERATION_HASH = HASH;

    const placement = await makeManager(
      new NodesOnlyK8sClient([node('europe-west9-a', true), node('europe-west9-b')]),
    ).resolveNixStorePlacement('nix-store-v2-pvc');

    expect(placement).toEqual({
      nixStorePvcName: 'nix-store-v2-b-pvc',
      nixStoreZone: 'europe-west9-b',
      nixStoreGenerationHash: HASH,
    });
  });

  it('prefers the first configured zone on equal capacity', async () => {
    process.env.NIX_STORE_PVC_ZONES = ZONE_MAP;
    delete process.env.NIX_STORE_GENERATION_HASH;

    const placement = await makeManager(
      new NodesOnlyK8sClient([node('europe-west9-a'), node('europe-west9-b')]),
    ).resolveNixStorePlacement('nix-store-v2-b-pvc');

    expect(placement).toEqual({ nixStorePvcName: 'nix-store-v2-pvc', nixStoreZone: 'europe-west9-a' });
  });

  it('NEVER rewrites a one-off PVC that is not a declared clone', async () => {
    process.env.NIX_STORE_PVC_ZONES = ZONE_MAP;
    delete process.env.NIX_STORE_GENERATION_HASH;

    expect(
      await makeManager(new NodesOnlyK8sClient([node('europe-west9-b')])).resolveNixStorePlacement(
        'nix-store-spike-pvc',
      ),
    ).toEqual({ nixStorePvcName: 'nix-store-spike-pvc' });
  });

  it('PINS to the existing data-disk zone even when capacity prefers another zone (post-restore deadlock fix)', async () => {
    process.env.NIX_STORE_PVC_ZONES = ZONE_MAP;
    process.env.NIX_STORE_GENERATION_HASH = HASH;

    /*
     * Both zones have capacity — zone-a would win the tie — but the workspace's
     * RWO data disk lives in zone-b, so the placement MUST follow the disk.
     */
    const placement = await makeManager(
      new NodesOnlyK8sClient([node('europe-west9-a'), node('europe-west9-b')]),
    ).resolveNixStorePlacement('nix-store-v2-pvc', 'europe-west9-b');

    expect(placement).toEqual({
      nixStorePvcName: 'nix-store-v2-b-pvc',
      nixStoreZone: 'europe-west9-b',
      nixStoreGenerationHash: HASH,
    });

    // A pinned zone with no declared clone falls through to the capacity path.
    const noClone = await makeManager(new NodesOnlyK8sClient([node('europe-west9-a')])).resolveNixStorePlacement(
      'nix-store-v2-pvc',
      'europe-west9-c',
    );
    expect(noClone.nixStoreZone).toBe('europe-west9-a');

    delete process.env.NIX_STORE_GENERATION_HASH;
  });

  it('falls back to the first configured zone when node listing fails (no refusal)', async () => {
    process.env.NIX_STORE_PVC_ZONES = ZONE_MAP;
    delete process.env.NIX_STORE_GENERATION_HASH;

    expect(await makeManager(new NodesOnlyK8sClient([], true)).resolveNixStorePlacement('nix-store-v2-pvc')).toEqual({
      nixStorePvcName: 'nix-store-v2-pvc',
      nixStoreZone: 'europe-west9-a',
    });
  });
});


/*
 * CTR-RUNTIME-NIX — registry mode: rotation (ACTIVE entry wins, env trio
 * ignored) and révocation (typed refusal, never a fallback).
 */
describe('resolveNixStorePlacement — generation registry', () => {
  const HASH2 = `sha256:${'2'.repeat(64)}`;
  const HASH3 = `sha256:${'3'.repeat(64)}`;
  const registry = (gen2Status: 'ACTIVE' | 'RETIRED' | 'REVOKED', gen3?: boolean) =>
    JSON.stringify({
      schemaVersion: 1,
      generations: [
        {
          id: 'gen-2',
          status: gen2Status,
          catalogSha256: HASH2,
          nixVersion: '2.34.8',
          nixpkgs: { channel: 'nixos-26.05', rev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3' },
          zones: { 'europe-west9-a': 'nix-store-v2-pvc', 'europe-west9-b': 'nix-store-v2-b-pvc' },
          bundles: [],
          publishedAt: '2026-07-15T00:00:00Z',
          ...(gen2Status === 'RETIRED' ? { retiredAt: '2026-07-22T00:00:00Z' } : {}),
          ...(gen2Status === 'REVOKED'
            ? { revokedAt: '2026-07-22T00:00:00Z', revokedReason: 'exercice de révocation' }
            : {}),
        },
        ...(gen3
          ? [
              {
                id: 'gen-3',
                status: 'ACTIVE',
                catalogSha256: HASH3,
                nixVersion: '2.34.8',
                nixpkgs: { channel: 'nixos-26.05', rev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3' },
                zones: { 'europe-west9-a': 'nix-store-v3-pvc' },
                bundles: [],
                publishedAt: '2026-07-22T00:00:00Z',
              },
            ]
          : []),
      ],
    });

  const saved = {
    zones: process.env.NIX_STORE_PVC_ZONES,
    hash: process.env.NIX_STORE_GENERATION_HASH,
    single: process.env.NIX_STORE_PVC_NAME,
    registry: process.env.NIX_STORE_GENERATIONS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      NIX_STORE_PVC_ZONES: saved.zones,
      NIX_STORE_GENERATION_HASH: saved.hash,
      NIX_STORE_PVC_NAME: saved.single,
      NIX_STORE_GENERATIONS: saved.registry,
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rotation: the ACTIVE generation drives zones + drift hash; the legacy env trio is ignored', async () => {
    process.env.NIX_STORE_GENERATIONS = registry('RETIRED', true);
    process.env.NIX_STORE_PVC_ZONES = 'europe-west9-a=legacy-a,europe-west9-b=legacy-b';
    process.env.NIX_STORE_GENERATION_HASH = `sha256:${'f'.repeat(64)}`;

    const placement = await makeManager(new NodesOnlyK8sClient([node('europe-west9-a')])).resolveNixStorePlacement(
      undefined,
    );

    expect(placement).toEqual({
      nixStorePvcName: 'nix-store-v3-pvc',
      nixStoreZone: 'europe-west9-a',
      nixStoreGenerationHash: HASH3,
    });
  });

  it('retention: an ecode.lock pin on a RETIRED generation still resolves (its own zones + hash)', async () => {
    process.env.NIX_STORE_GENERATIONS = registry('RETIRED', true);

    const placement = await makeManager(new NodesOnlyK8sClient([node('europe-west9-b')])).resolveNixStorePlacement(
      undefined,
      undefined,
      'gen-2',
    );

    expect(placement.nixStoreGenerationHash).toBe(HASH2);
    expect(placement.nixStorePvcName).toBe('nix-store-v2-b-pvc');
  });

  it('révocation: a pin on a REVOKED generation THROWS typed — never a silent fallback', async () => {
    process.env.NIX_STORE_GENERATIONS = registry('REVOKED', true);
    const manager = makeManager(new NodesOnlyK8sClient([node('europe-west9-a')]));

    await expect(manager.resolveNixStorePlacement(undefined, undefined, 'gen-2')).rejects.toMatchObject({
      code: 'NIX_GENERATION_REVOKED',
    });
  });

  it('registry with nothing ACTIVE = store disabled (explicit foreign PVC passes through ungoverned)', async () => {
    process.env.NIX_STORE_GENERATIONS = registry('RETIRED');

    const manager = makeManager(new NodesOnlyK8sClient([node('europe-west9-a')]));
    expect(await manager.resolveNixStorePlacement(undefined)).toEqual({});
    expect(await manager.resolveNixStorePlacement('spike-disk-pvc')).toEqual({ nixStorePvcName: 'spike-disk-pvc' });
  });
});
