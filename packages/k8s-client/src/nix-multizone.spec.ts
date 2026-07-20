import { describe, expect, it } from 'vitest';
import { appBuildPod } from './app-build.js';
import {
  chooseNixStoreZone,
  nixStoreGuardInitContainer,
  parseNixStorePvcZones,
  serverAppDeployment,
  workspacePod,
  type K8sObject,
  type NixStoreZonePvc,
  type ServerRuntimeInput,
  type WorkspaceRuntimeInput,
} from './index.js';

/*
 * D3 multi-zone shared Nix store (approved 2026-07-17): per-zone identical
 * clones + topology-aware placement + generation drift guard. These tests pin
 * the three invariants:
 *  1. zone choice follows live schedulable capacity (a cordoned/stocked-out
 *     zone loses), ties resolve to configured order, no signal ⇒ first zone;
 *  2. a pod mounting a clone is PINNED to that clone's zone;
 *  3. the drift guard initContainer appears iff a generation hash is armed,
 *     and refuses malformed hashes outright.
 */

const HASH = 'sha256:3029b5810ba485844f1029132f3f00652075e1e2c0cbb454992d3a94aa8fd5d5';

const ZONES: NixStoreZonePvc[] = [
  { zone: 'europe-west9-a', pvcName: 'nix-store-v2-pvc' },
  { zone: 'europe-west9-b', pvcName: 'nix-store-v2-b-pvc' },
];

let nodeSeq = 0;

function node(zone: string, over: { unschedulable?: boolean; ready?: boolean } = {}): K8sObject {
  nodeSeq += 1;

  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: `node-${zone}-${nodeSeq}`, labels: { 'topology.kubernetes.io/zone': zone } },
    spec: over.unschedulable ? { unschedulable: true } : {},
    status: { conditions: [{ type: 'Ready', status: over.ready === false ? 'False' : 'True' }] },
  } as unknown as K8sObject;
}

describe('parseNixStorePvcZones', () => {
  it('parses the zone=pvc list in order and drops malformed entries', () => {
    expect(
      parseNixStorePvcZones('europe-west9-a=nix-store-v2-pvc, europe-west9-b=nix-store-v2-b-pvc,broken,=x,y='),
    ).toEqual(ZONES);
    expect(parseNixStorePvcZones(undefined)).toEqual([]);
    expect(parseNixStorePvcZones('')).toEqual([]);
  });
});

describe('chooseNixStoreZone', () => {
  it('prefers the FIRST configured zone on equal capacity (warm zone wins ties)', () => {
    const chosen = chooseNixStoreZone(ZONES, [node('europe-west9-a'), node('europe-west9-b')]);
    expect(chosen?.zone).toBe('europe-west9-a');
  });

  it('routes to the surviving zone when the preferred zone is cordoned (the zone-a stockout case)', () => {
    const chosen = chooseNixStoreZone(ZONES, [node('europe-west9-a', { unschedulable: true }), node('europe-west9-b')]);
    expect(chosen?.zone).toBe('europe-west9-b');
    expect(chosen?.pvcName).toBe('nix-store-v2-b-pvc');
  });

  it('ignores NotReady nodes as capacity', () => {
    const chosen = chooseNixStoreZone(ZONES, [node('europe-west9-a', { ready: false }), node('europe-west9-b')]);
    expect(chosen?.zone).toBe('europe-west9-b');
  });

  it('falls back to the first configured zone with no usable signal (legacy behaviour, never a refusal)', () => {
    expect(chooseNixStoreZone(ZONES, [])?.zone).toBe('europe-west9-a');
    expect(chooseNixStoreZone([], [node('europe-west9-a')])).toBeUndefined();
  });
});

describe('nixStoreGuardInitContainer', () => {
  it('refuses a malformed generation hash outright', () => {
    expect(() => nixStoreGuardInitContainer('img', 'not-a-hash')).toThrow(/sha256/);
  });

  it('verifies the catalog hash against the expected value', () => {
    const guard = nixStoreGuardInitContainer('img', HASH);
    expect(guard.env).toEqual([{ name: 'NIX_STORE_EXPECTED_CATALOG_SHA256', value: HASH }]);
    expect(guard.command.join(' ')).toContain('/nix/ecode/catalog.json');
    expect(guard.volumeMounts).toEqual([{ name: 'nix-store', mountPath: '/nix', readOnly: true }]);
  });
});

const WORKSPACE_INPUT: WorkspaceRuntimeInput = {
  namespace: 'workspaces',
  orgId: 'org1',
  projectId: 'proj1',
  workspaceId: 'ws1',
  image: 'registry.test/workspace-agent:dev',
  pvcName: 'pvc-ws1',
  agentTokenSecretName: 'agent-token-ws1',
  env: {},
  secretEnv: {},
  plan: 'free',
};

describe('workspacePod (D3 wiring)', () => {
  it('pins the pod to the store zone and arms the drift guard', () => {
    const pod = workspacePod({
      ...WORKSPACE_INPUT,
      nixStorePvcName: 'nix-store-v2-b-pvc',
      nixStoreZone: 'europe-west9-b',
      nixStoreGenerationHash: HASH,
    }) as any;

    expect(pod.spec.nodeSelector['topology.kubernetes.io/zone']).toBe('europe-west9-b');
    expect(pod.spec.initContainers).toHaveLength(1);
    expect(pod.spec.initContainers[0].name).toBe('nix-store-guard');
    expect(pod.spec.volumes.some((v: any) => v.persistentVolumeClaim?.claimName === 'nix-store-v2-b-pvc')).toBe(true);
  });

  it('emits NO zone pin / NO initContainers without the multi-zone inputs (kill switch intact)', () => {
    const legacy = workspacePod({ ...WORKSPACE_INPUT, nixStorePvcName: 'nix-store-v2-pvc' }) as any;
    expect(legacy.spec.nodeSelector?.['topology.kubernetes.io/zone']).toBeUndefined();
    expect(legacy.spec.initContainers).toBeUndefined();

    const off = workspacePod(WORKSPACE_INPUT) as any;
    expect(JSON.stringify(off)).not.toContain('nix');
  });
});

const SERVER_INPUT: ServerRuntimeInput = {
  deploymentId: 'dep1',
  namespace: 'workspaces',
  image: 'registry.test/app@sha256:' + 'a'.repeat(64),
  port: 3000,
  host: 'd-dep1.preview.test',
  tlsSecretName: 'tls',
};

describe('serverAppDeployment (D3 wiring)', () => {
  it('pins the app pod to the store zone and arms the drift guard', () => {
    const dep = serverAppDeployment({
      ...SERVER_INPUT,
      nixStorePvcName: 'nix-store-v2-b-pvc',
      nixStoreZone: 'europe-west9-b',
      nixStoreGenerationHash: HASH,
    }) as any;

    const podSpec = dep.spec.template.spec;

    expect(podSpec.nodeSelector['topology.kubernetes.io/zone']).toBe('europe-west9-b');
    expect(podSpec.initContainers?.[0]?.name).toBe('nix-store-guard');
  });

  it('leaves the spec untouched without the multi-zone inputs', () => {
    const dep = serverAppDeployment({ ...SERVER_INPUT, nixStorePvcName: 'nix-store-v2-pvc' }) as any;
    const podSpec = dep.spec.template.spec;
    expect(podSpec.nodeSelector?.['topology.kubernetes.io/zone']).toBeUndefined();
    expect(podSpec.initContainers).toBeUndefined();
  });
});

describe('appBuildPod (D3 wiring)', () => {
  const BUILD_INPUT = {
    deploymentId: 'dep1',
    namespace: 'workspaces',
    image: 'registry.test/app@sha256:' + 'a'.repeat(64),
    revisionUrl: 'https://storage.test/rev.tar.gz',
    artifactUrl: 'https://storage.test/artifact',
    artifactHeaders: {},
    timeoutSeconds: 600,
  };

  it('pins the build pod to the store zone and arms the drift guard', () => {
    const pod = appBuildPod({
      ...BUILD_INPUT,
      nixStorePvcName: 'nix-store-v2-b-pvc',
      nixStoreZone: 'europe-west9-b',
      nixStoreGenerationHash: HASH,
    } as any) as any;

    expect(pod.spec.nodeSelector['topology.kubernetes.io/zone']).toBe('europe-west9-b');
    expect(pod.spec.initContainers?.[0]?.name).toBe('nix-store-guard');
  });
});
