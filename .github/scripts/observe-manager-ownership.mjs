import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { projectList } from './observe-manager-terminality.mjs';

const namespace = 'vibecore';
const name = 'vibecore-vibecore-platform-workspace-manager';
const selector = 'app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=vibecore';
const revisionKey = 'deployment.kubernetes.io/revision';
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 253;
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const revision = (value) => (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) ? value : null);

const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    record(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item,
  );
const refuse = () => {
  throw new Error('MANAGER_OWNERSHIP_UNAVAILABLE');
};

function object(value, kind, apiVersion) {
  if (
    !record(value) ||
    value.kind !== kind ||
    value.apiVersion !== apiVersion ||
    value.metadata?.namespace !== namespace ||
    !text(value.metadata?.uid) ||
    !text(value.metadata?.name) ||
    !text(value.metadata?.resourceVersion)
  ) {
    refuse();
  }
}

function list(value, kind, apiVersion) {
  if (
    !record(value) ||
    value.kind !== `${kind}List` ||
    value.apiVersion !== apiVersion ||
    !Array.isArray(value.items) ||
    value.items.length > 256 ||
    value.metadata?.continue ||
    !text(value.metadata?.resourceVersion)
  ) {
    refuse();
  }

  const ids = new Set();
  const names = new Set();

  for (const item of value.items) {
    object(item, kind, apiVersion);

    if (ids.has(item.metadata.uid) || names.has(item.metadata.name)) {
      refuse();
    }

    names.add(item.metadata.name);
    ids.add(item.metadata.uid);
  }
}

function owner(value, kind) {
  const refs = value.metadata?.ownerReferences;

  if (!Array.isArray(refs) || refs.some((ref) => !record(ref))) {
    return null;
  }

  const controllers = refs.filter((ref) => ref.controller === true);

  if (controllers.length !== 1) {
    return null;
  }

  const ref = controllers[0];

  return ref.kind === kind && ref.apiVersion === 'apps/v1' && text(ref.uid) && text(ref.name) ? ref : null;
}

const ownedBy = (child, parent, kind) => {
  const ref = owner(child, kind);
  return Boolean(ref && ref.uid === parent.metadata.uid && ref.name === parent.metadata.name);
};

function template(value) {
  if (
    !record(value.spec?.template?.metadata) ||
    !record(value.spec?.template?.spec) ||
    !Array.isArray(value.spec.template.spec.containers) ||
    value.spec.template.spec.containers.length !== 1
  ) {
    return null;
  }

  const copy = structuredClone(value.spec.template);

  if (record(copy.metadata.labels)) {
    delete copy.metadata.labels['pod-template-hash'];
  }

  return canonical(copy);
}

/** Stable controller bracket, not an atomic snapshot or evidence about any prior deployment. */
export function projectOwnership({ before, setsBefore, pods, setsAfter, after }) {
  object(before, 'Deployment', 'apps/v1');
  object(after, 'Deployment', 'apps/v1');
  list(setsBefore, 'ReplicaSet', 'apps/v1');
  list(setsAfter, 'ReplicaSet', 'apps/v1');
  list(pods, 'Pod', 'v1');

  if (before.metadata.name !== name || after.metadata.name !== name || canonical(before) !== canonical(after)) {
    refuse();
  }

  const sorted = (value) => [...value.items].sort((a, b) => a.metadata.uid.localeCompare(b.metadata.uid));

  if (canonical(sorted(setsBefore)) !== canonical(sorted(setsAfter))) {
    refuse();
  }

  const depRevision = revision(before.metadata.annotations?.[revisionKey]);
  const depTemplate = template(before);
  const generation = count(before.metadata.generation);
  const observed = count(before.status?.observedGeneration);
  const generationObserved = generation !== null && generation > 0 && observed !== null && observed >= generation;
  const sets = sorted(setsBefore);

  const rows = sets.map((rs) => ({
    controlledByDeployment: ownedBy(rs, before, 'Deployment'),
    revisionKnown: revision(rs.metadata.annotations?.[revisionKey]) !== null,
    revisionMatches: depRevision !== null && revision(rs.metadata.annotations?.[revisionKey]) === depRevision,
    templateMatches: depTemplate !== null && template(rs) === depTemplate,
    deleting: Boolean(rs.metadata.deletionTimestamp),
    desired: count(rs.spec?.replicas),
    replicas: count(rs.status?.replicas),
    ready: count(rs.status?.readyReplicas),
    available: count(rs.status?.availableReplicas),
  }));
  const candidates = rows.flatMap((row, index) =>
    row.controlledByDeployment && row.revisionMatches && row.templateMatches && !row.deleting ? [index] : [],
  );
  const current =
    candidates.length === 1 && generationObserved && !before.metadata.deletionTimestamp ? candidates[0] : null;

  const terminality = projectList(pods);

  const classifications = pods.items.map((pod) => {
    const ref = owner(pod, 'ReplicaSet');
    const index = ref ? sets.findIndex((rs) => ref.uid === rs.metadata.uid && ref.name === rs.metadata.name) : -1;

    let relation = 'unknown';

    if (index >= 0 && current !== null && rows[index].controlledByDeployment) {
      relation = index === current ? 'current-controller' : 'other-owned-controller';
    }

    return {
      relation,
      ownerResolved: index >= 0,
      controlledByDeployment: index >= 0 ? rows[index].controlledByDeployment : null,
      revisionMatches: index >= 0 ? rows[index].revisionMatches : null,
      templateMatches: index >= 0 ? rows[index].templateMatches : null,
      deleting: Boolean(pod.metadata.deletionTimestamp),
      nodeName:
        pod.spec?.nodeName === undefined
          ? 'absent'
          : pod.spec.nodeName === ''
            ? 'empty'
            : typeof pod.spec.nodeName === 'string' &&
                pod.spec.nodeName.length <= 253 &&
                pod.spec.nodeName.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
              ? 'valid'
              : 'invalid',
      ownerReferencesArray: Array.isArray(pod.metadata.ownerReferences),
      controllerReferenceValid: ref !== null,
    };
  });

  return {
    ...terminality,
    schemaVersion: 2,
    ownership: {
      controllerBracketStable: true,
      atomicSnapshot: false,
      priorPodIdentityProven: false,
      generationObserved,
      deploymentRevisionKnown: depRevision !== null,
      currentControllerUnique: current !== null,
      candidateCount: candidates.length,
      desired: count(before.spec?.replicas),
      updated: count(before.status?.updatedReplicas),
      ready: count(before.status?.readyReplicas),
      available: count(before.status?.availableReplicas),
      replicaSetCount: rows.length,
      replicaSetsOmitted: Math.max(0, rows.length - 16),
      replicaSets: rows.slice(0, 16),
      counts: Object.fromEntries(
        ['current-controller', 'other-owned-controller', 'unknown'].map((relation) => [
          relation,
          classifications.filter((row) => row.relation === relation).length,
        ]),
      ),
    },
    pods: terminality.pods.map((pod, index) => ({ ...pod, ownership: classifications[index] })),
  };
}

/** Fixed GETs only; every failure stops, no retries, fallback identities or raw output. */
export function observeOwnership(command = execFileSync) {
  const get = (resource, target) => {
    const args = [
      'prod-gateway',
      'kubectl',
      '-n',
      namespace,
      'get',
      resource,
      ...target,
      '--request-timeout=15s',
      '-o',
      'json',
    ];
    const output = command('scripts/ci/cluster.sh', args, {
      timeout: 20000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!(typeof output === 'string' || Buffer.isBuffer(output)) || Buffer.byteLength(output) > 1024 * 1024) {
      refuse();
    }

    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(output)));

    if (resource === 'deployment') {
      object(value, 'Deployment', 'apps/v1');

      if (value.metadata.name !== name) {
        refuse();
      }
    } else {
      list(value, resource === 'pods' ? 'Pod' : 'ReplicaSet', resource === 'pods' ? 'v1' : 'apps/v1');

      if (resource === 'pods') {
        projectList(value);
      }
    }

    return value;
  };

  const before = get('deployment', [name]);
  const setsBefore = get('replicasets', ['-l', selector]);
  const pods = get('pods', ['-l', selector]);
  const setsAfter = get('replicasets', ['-l', selector]);
  const after = get('deployment', [name]);

  return projectOwnership({ before, setsBefore, pods, setsAfter, after });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) {
      refuse();
    }

    process.stdout.write(`${JSON.stringify(observeOwnership())}\n`);
  } catch {
    process.stderr.write('MANAGER_OWNERSHIP_UNAVAILABLE\n');
    process.exitCode = 1;
  }
}
