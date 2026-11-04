/** Preparatory upgrade: new migration image, then manager; all other deployment templates stay unchanged. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAllDocuments } from 'yaml';

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const chart = 'infra/helm/platform';

const fail = (reason) => {
  throw new Error(`STAGED_MANAGER_${reason}`);
};
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

/** Paths only: dynamic data/annotation keys and every leaf value stay private. */
function changedPaths(before, after) {
  const paths = new Set();

  let visited = 0;
  let truncated = false;

  const walk = (a, b, path, depth) => {
    if (canonical(a) === canonical(b)) {
      return;
    }

    if (++visited > 4096 || depth > 20 || paths.size >= 32) {
      truncated = true;
      return;
    }

    if (/(?:^|\/)(?:data|stringData|annotations|labels)$/.test(path)) {
      paths.add(`${path}/*`);
      return;
    }

    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const safe = /^[a-zA-Z0-9_-]{1,80}$/.test(key) ? key : '*';
        walk(a[key], b[key], `${path}/${safe}`, depth + 1);
      }
    } else {
      paths.add(path || '/');
    }
  };
  walk(before, after, '', 0);

  return { paths: [...paths].sort(), truncated };
}

function resourceIdentity(item) {
  const safe = (value) => (typeof value === 'string' && /^[a-zA-Z0-9./_-]{1,253}$/.test(value) ? value : '[redacted]');
  return {
    apiVersion: safe(item.apiVersion),
    kind: safe(item.kind),
    namespace: item.metadata.namespace ? safe(item.metadata.namespace) : '',
    name: safe(item.metadata.name),
  };
}

export function renderedRelease(output) {
  let release;

  try {
    release = JSON.parse(output);
  } catch {
    fail('INVALID_DRY_RUN_RELEASE');
  }

  if (
    typeof release?.manifest !== 'string' ||
    !Array.isArray(release.hooks) ||
    release.hooks.some((hook) => typeof hook?.manifest !== 'string')
  ) {
    fail('INVALID_DRY_RUN_RELEASE');
  }

  return [release.manifest, ...release.hooks.map((hook) => hook.manifest)].join('\n---\n');
}

function resources(yaml) {
  return parseAllDocuments(yaml)
    .map((doc) => {
      if (doc.errors.length) {
        fail('INVALID_MANIFEST');
      }

      return doc.toJSON();
    })
    .filter(Boolean);
}

const deployments = (yaml) => resources(yaml).filter((doc) => doc.kind === 'Deployment');

export function stagePlan(manifest, targetSha, previousRevision) {
  const api = manifest.services.filter((entry) => entry.service === 'api');

  if (api.length !== 1) {
    fail('API_MISSING');
  }

  if (!api[0].rebuilt) {
    return null;
  }

  const manager = manifest.services.filter((entry) => entry.service === 'workspaceManager');

  if (!/^[1-9][0-9]*$/.test(previousRevision ?? '')) {
    fail('INITIAL_REVISION_REQUIRED');
  }

  if (!shaPattern.test(targetSha ?? '') || manager.length !== 1) {
    fail('PROVENANCE_REQUIRED');
  }

  for (const entry of [api[0], manager[0]]) {
    if (entry.rebuilt !== true || entry.sourceSha !== targetSha || !digestPattern.test(entry.digest)) {
      fail('PROVENANCE_REQUIRED');
    }
  }

  if (api[0].image !== 'api' || manager[0].image !== 'workspace-manager') {
    fail('IMAGE_REQUIRED');
  }

  return {
    migrationDigest: api[0].digest,
    managerDigest: manager[0].digest,
    sourceSha: targetSha,
  };
}

/** Refuse chart/default drift in stage one instead of quietly rolling another service. */
export function assertOnlyManagerChanges(beforeYaml, afterYaml, managerName, migrationImage) {
  const before = resources(beforeYaml);
  const after = resources(afterYaml);

  const key = (item) => `${item.apiVersion}/${item.kind}/${item.metadata.namespace ?? ''}/${item.metadata.name}`;

  if (
    !before.some((item) => item.kind === 'Deployment' && item.metadata.name === managerName) ||
    before.length !== after.length ||
    new Set(before.map(key)).size !== before.length ||
    new Set(after.map(key)).size !== after.length
  ) {
    fail('RESOURCE_SET_CHANGED');
  }

  const migrationName = managerName.replace(/-workspace-manager$/, '-prisma-migrate');

  if (migrationImage) {
    const hooks = after.filter((item) => item.metadata.annotations?.['helm.sh/hook']);
    const job = hooks.find((item) => item.kind === 'Job' && item.metadata.name === migrationName);
    const account = hooks.find((item) => item.kind === 'ServiceAccount' && item.metadata.name === migrationName);

    if (
      hooks.length !== 2 ||
      !job ||
      !account ||
      hooks.some((item) => item.metadata.annotations['helm.sh/hook'] !== 'pre-install,pre-upgrade') ||
      job.metadata.annotations['helm.sh/hook-weight'] !== '-10' ||
      account.metadata.annotations['helm.sh/hook-weight'] !== '-20' ||
      job.spec.template.spec.serviceAccountName !== migrationName ||
      job.spec.template.spec.automountServiceAccountToken !== false ||
      job.spec.template.spec.containers.length !== 1 ||
      job.spec.template.spec.containers[0].image !== migrationImage
    ) {
      fail('MIGRATION_HOOK_UNVERIFIED');
    }
  }

  const changes = [];

  let truncated = false;

  for (const old of before) {
    const next = after.find((item) => key(item) === key(old));

    if (!next) {
      fail('RESOURCE_SET_CHANGED');
    }

    const normalize = (item) => {
      const copy = structuredClone(item);

      if (item.kind === 'Deployment' && item.metadata.name === managerName) {
        const containers = copy.spec.template.spec.containers;

        if (containers.length !== 1) {
          fail('MANAGER_CONTAINER_COUNT');
        }

        delete containers[0].image;

        for (const key of ['vibecore.dev/image-source-sha', 'vibecore.dev/image-source-digest']) {
          delete copy.spec.template.metadata.annotations?.[key];
        }
      }

      if (item.kind === 'Job' && item.metadata.name === migrationName && migrationImage) {
        /*
         * Every other hook property, including command, identity and security,
         * must match the previous release. No new hook is silently exempted.
         */
        delete copy.spec.template.spec.containers[0].image;
      }

      return copy;
    };

    const a = normalize(old);
    const b = normalize(next);

    if (canonical(a) !== canonical(b)) {
      if (changes.length < 16) {
        changes.push({
          resource: resourceIdentity(old),
          ...changedPaths(a, b),
        });
      } else {
        truncated = true;
      }
    }
  }

  if (changes.length || truncated) {
    fail(`UNRELATED_RESOURCE_CHANGED ${JSON.stringify({ changes, truncated })}`);
  }
}

/** Optional Ready conditions do not override current, complete termination evidence. */
function terminalManagerEvidence(pod) {
  const status = pod.status;
  const conditions = status?.conditions;
  const ready = Array.isArray(conditions) ? conditions.filter((condition) => condition?.type === 'Ready') : [];

  const readyCondition =
    conditions !== undefined && !Array.isArray(conditions)
      ? 'Invalid'
      : ready.some((condition) => condition.status === 'True')
        ? 'True'
        : ready.some((condition) => condition.status !== 'False')
          ? 'Other'
          : ready.length
            ? 'False'
            : 'Absent';

  const stopped = (containers, regular = false) => {
    if (containers === undefined) {
      return regular ? 'Missing' : 'Absent';
    }

    if (!Array.isArray(containers)) {
      return 'Invalid';
    }

    if (regular && (!containers.length || containers.length !== pod.spec?.containers?.length)) {
      return 'Incomplete';
    }

    const terminated = containers.every(
      (container) =>
        container?.state?.terminated &&
        typeof container.state.terminated === 'object' &&
        Number.isInteger(container.state.terminated.exitCode) &&
        !container.state.running &&
        !container.state.waiting &&
        (!regular || container.ready === false),
    );

    return terminated ? 'Stopped' : 'NotTerminated';
  };

  return {
    phaseTerminal: ['Failed', 'Succeeded'].includes(status?.phase),
    readyCondition,
    regular: stopped(status?.containerStatuses, true),
    init: stopped(status?.initContainerStatuses),
    ephemeral: stopped(status?.ephemeralContainerStatuses),
  };
}

function terminalManagerPod(pod) {
  const evidence = terminalManagerEvidence(pod);
  return (
    evidence.phaseTerminal &&
    ['False', 'Absent'].includes(evidence.readyCondition) &&
    evidence.regular === 'Stopped' &&
    [evidence.init, evidence.ephemeral].every((state) => ['Stopped', 'Absent'].includes(state))
  );
}

/** Only bounded structural identities and booleans; never labels, messages, specs or image strings. */
function managerReadinessDiagnostic(deployment, pods, expectedDigest) {
  const items = Array.isArray(pods?.items) ? pods.items : [];

  const identity = (value) =>
    typeof value === 'string' && value.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ? value : null;
  const uid = (value) =>
    typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value) ? value : null;

  const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);

  const ready = (pod) =>
    Array.isArray(pod.status?.conditions) &&
    pod.status.conditions.some((condition) => condition.type === 'Ready' && condition.status === 'True');

  const terminal = items.filter(terminalManagerPod).length;

  return {
    expected: count(deployment.spec?.replicas ?? 1),
    observed: items.length - terminal,
    total: items.length,
    terminal,
    deleting: items.filter((pod) => Boolean(pod.metadata?.deletionTimestamp)).length,
    ready: items.filter(ready).length,
    generation: count(deployment.metadata?.generation),
    observedGeneration: count(deployment.status?.observedGeneration),
    updatedReplicas: count(deployment.status?.updatedReplicas),
    readyReplicas: count(deployment.status?.readyReplicas),
    availableReplicas: count(deployment.status?.availableReplicas),
    truncated: items.length > 16,
    pods: items.slice(0, 16).map((pod) => ({
      name: identity(pod.metadata?.name),
      uid: uid(pod.metadata?.uid),
      phase: ['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown'].includes(pod.status?.phase)
        ? pod.status.phase
        : 'Unknown',
      deleting: Boolean(pod.metadata?.deletionTimestamp),
      ready: ready(pod),
      terminal: terminalManagerPod(pod),
      terminalEvidence: terminalManagerEvidence(pod),
      targetDigestMatch:
        Array.isArray(pod.status?.containerStatuses) &&
        pod.status.containerStatuses.length === 1 &&
        pod.status.containerStatuses[0].imageID?.match(/(?:^|@|:\/\/)(sha256:[a-f0-9]{64})$/)?.[1] === expectedDigest,
      owners: (Array.isArray(pod.metadata?.ownerReferences) ? pod.metadata.ownerReferences : [])
        .slice(0, 2)
        .map((owner) => ({
          kind: owner.kind === 'ReplicaSet' ? 'ReplicaSet' : 'Other',
          name: identity(owner.name),
          uid: uid(owner.uid),
          controller: owner.controller === true,
        })),
    })),
  };
}

export function assertManagerReady(deployment, pods, expectedImage, expectedDigest) {
  const desired = deployment.spec.replicas ?? 1;
  const status = deployment.status ?? {};

  const reject = (code) =>
    fail(`${code} ${JSON.stringify(managerReadinessDiagnostic(deployment, pods, expectedDigest))}`);

  if (
    !Number.isInteger(desired) ||
    desired < 1 ||
    !Number.isInteger(deployment.metadata.generation) ||
    deployment.metadata.generation < 1 ||
    !Number.isInteger(status.observedGeneration) ||
    status.observedGeneration < deployment.metadata.generation ||
    status.updatedReplicas !== desired ||
    status.readyReplicas !== desired ||
    status.availableReplicas !== desired ||
    deployment.spec.template.spec.containers.length !== 1 ||
    deployment.spec.template.spec.containers[0].image !== expectedImage
  ) {
    reject('MANAGER_NOT_READY');
  }

  if (!Array.isArray(pods?.items)) {
    reject('MANAGER_PODS_INVALID');
  }

  const active = pods.items.filter((pod) => !terminalManagerPod(pod));

  if (active.length !== desired) {
    reject('MANAGER_POD_COUNT');
  }

  for (const pod of active) {
    const container = pod.status?.containerStatuses;

    if (
      pod.status?.phase !== 'Running' ||
      Boolean(pod.metadata?.deletionTimestamp) ||
      pod.spec.containers.length !== 1 ||
      pod.spec.containers[0].image !== expectedImage ||
      container?.length !== 1 ||
      container[0].ready !== true ||
      !container[0].state?.running ||
      typeof container[0].state.running !== 'object' ||
      Boolean(container[0].state.terminated || container[0].state.waiting) ||
      container[0].imageID?.match(/(?:^|@|:\/\/)(sha256:[a-f0-9]{64})$/)?.[1] !== expectedDigest ||
      !pod.status.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True')
    ) {
      reject('MANAGER_POD_UNVERIFIED');
    }
  }
}

/** Attest the retained Helm migration Job, not database ledger contents. */
export function assertMigrationComplete(job, expectedName, expectedImage) {
  if (
    job?.metadata?.name !== expectedName ||
    typeof job.metadata.uid !== 'string' ||
    !job.metadata.uid ||
    job.metadata.deletionTimestamp ||
    job.status?.succeeded !== 1 ||
    !job.status.conditions?.some((condition) => condition.type === 'Complete' && condition.status === 'True') ||
    job.status.conditions.some((condition) => condition.type === 'Failed' && condition.status === 'True') ||
    job.spec?.template?.spec?.containers?.length !== 1 ||
    job.spec.template.spec.containers[0].image !== expectedImage
  ) {
    fail('MIGRATION_JOB_UNVERIFIED');
  }

  return {
    uid: job.metadata.uid,
    image: expectedImage,
    succeeded: 1,
    complete: true,
  };
}

/* Operation and phase are constants, never inferred from command text or provider errors. */
const stageOperations = {
  'read-release-manifest': ['helm', 'preflight'],
  'read-release-hooks': ['helm', 'preflight'],
  'preview-upgrade': ['helm', 'preflight'],
  'read-retained-deployment': ['kubectl', 'preflight'],
  'upgrade-manager': ['helm', 'upgrade-requested'],
  'read-migration-job': ['kubectl', 'upgrade-returned'],
  'rollout-manager': ['kubectl', 'migration-job-verified'],
  'observe-manager-deployment': ['kubectl', 'manager-readiness'],
  'observe-manager-pods': ['kubectl', 'manager-readiness'],
};

const processSignals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGHUP']);

const processCodes = new Set([
  'ETIMEDOUT',
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOBUFS',
  'EPIPE',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

function stageCommand(command, operation, args, options, lastObservation = null) {
  const [bin, phase] = stageOperations[operation];

  try {
    return command(bin, args, options);
  } catch (error) {
    return fail(
      `COMMAND_FAILED ${JSON.stringify({
        operation,
        phase,
        status: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : null,
        signal: processSignals.has(error?.signal) ? error.signal : null,
        code: processCodes.has(error?.code) ? error.code : null,
        lastObservation,
      })}`,
    );
  }
}

/** Parsing failures identify only the fixed operation; never serialize SyntaxError or response text. */
function stageJson(command, operation, args, options, lastObservation = null) {
  const output = stageCommand(command, operation, args, options, lastObservation);

  try {
    return JSON.parse(output);
  } catch {
    return fail(`JSON_INVALID ${JSON.stringify({ operation, phase: stageOperations[operation][1] })}`);
  }
}

/** Read-only convergence shares the rollout deadline; command/JSON errors are never retried. */
export function waitForManagerReady({ command, namespace, release, managerName, image, digest, now, pause }) {
  const deadline = now() + 22 * 60 * 1000;
  stageCommand(
    command,
    'rollout-manager',
    ['-n', namespace, 'rollout', 'status', `deployment/${managerName}`, '--timeout=22m'],
    {
      timeout: 22 * 60 * 1000,
    },
  );

  let lastDiagnostic = null;
  let observations = 0;

  const remaining = () => {
    const left = deadline - now();

    if (left <= 0) {
      fail(`MANAGER_READINESS_TIMEOUT ${JSON.stringify({ lastObservation: lastDiagnostic })}`);
    }

    return left;
  };

  while (true) {
    const deployment = stageJson(
      command,
      'observe-manager-deployment',
      [
        '-n',
        namespace,
        'get',
        'deployment',
        managerName,
        '-o',
        'json',
        `--request-timeout=${Math.ceil(remaining())}ms`,
      ],
      { timeout: Math.ceil(remaining()) },
      lastDiagnostic,
    );
    const pods = stageJson(
      command,
      'observe-manager-pods',
      [
        '-n',
        namespace,
        'get',
        'pods',
        '-l',
        `app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=${release}`,
        '-o',
        'json',
        `--request-timeout=${Math.ceil(remaining())}ms`,
      ],
      { timeout: Math.ceil(remaining()) },
      lastDiagnostic,
    );
    remaining();
    observations++;

    try {
      assertManagerReady(deployment, pods, image, digest);

      const diagnostic = managerReadinessDiagnostic(deployment, pods, digest);

      return {
        desired: diagnostic.expected,
        active: diagnostic.observed,
        terminalExcluded: diagnostic.terminal,
        observations,
      };
    } catch (error) {
      if (!/^STAGED_MANAGER_MANAGER_(?:NOT_READY|POD_COUNT|POD_UNVERIFIED) /.test(error.message)) {
        throw error;
      }

      lastDiagnostic = managerReadinessDiagnostic(deployment, pods, digest);
    }
    pause(Math.min(1000, remaining()));
  }
}

export function runStage({
  manifest,
  env = process.env,
  now = () => performance.now(),
  pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  command = (bin, args, options = {}) =>
    execFileSync(bin, args, {
      timeout: options.timeout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    }),
}) {
  const plan = stagePlan(manifest, env.TARGET_SHA, env.INITIAL_REVISION);

  if (!plan) {
    return { skipped: true };
  }

  const { HELM_RELEASE: release, HELM_NAMESPACE: namespace, REG: registry } = env;

  if (!release || !namespace || !registry || !env.GITHUB_ENV) {
    fail('ENV_REQUIRED');
  }

  const managerName = `${release}-vibecore-platform-workspace-manager`;
  const image = `${registry}/workspace-manager@${plan.managerDigest}`;

  const before =
    stageCommand(command, 'read-release-manifest', ['get', 'manifest', release, '-n', namespace]) +
    '\n---\n' +
    stageCommand(command, 'read-release-hooks', ['get', 'hooks', release, '-n', namespace]);
  const oldApi = deployments(before).filter(
    (deployment) => deployment.metadata.name === `${release}-vibecore-platform-api`,
  );

  if (
    oldApi.length !== 1 ||
    oldApi[0].spec.template.spec.containers.length !== 1 ||
    !/@sha256:[a-f0-9]{64}$/.test(oldApi[0].spec.template.spec.containers[0].image)
  ) {
    fail('OLD_API_NOT_PINNED');
  }

  const overrides = [
    '--set',
    'migrations.enabled=true',
    '--set-string',
    `migrations.imageDigest=${plan.migrationDigest}`,
    '--set-string',
    `services.workspaceManager.imageDigest=${plan.managerDigest}`,
    '--set-string',
    `services.workspaceManager.imageSourceSha=${plan.sourceSha}`,
    '--set-string',
    `services.workspaceManager.imageSourceDigest=${plan.managerDigest}`,
  ];

  /*
   * Render the exact upgrade operation, including the old chart's coalesced
   * defaults. `helm template -f get-values.json` uses new defaults instead.
   */
  const upgradeArgs = [
    'upgrade',
    release,
    chart,
    '-n',
    namespace,
    '--reuse-values',
    '--atomic',
    '--timeout',
    '25m',
    ...overrides,
  ];

  const rendered = renderedRelease(
    stageCommand(command, 'preview-upgrade', [...upgradeArgs, '--dry-run=server', '-o', 'json']),
  );
  assertOnlyManagerChanges(before, rendered, managerName, `${registry}/api@${plan.migrationDigest}`);

  if (
    deployments(rendered).find((item) => item.metadata.name === managerName)?.spec.template.spec.containers[0].image !==
    image
  ) {
    fail('REGISTRY_MISMATCH');
  }

  // Also refuse an already drifted live image before touching the release.
  for (const deployment of deployments(before)) {
    const live = stageJson(command, 'read-retained-deployment', [
      '-n',
      namespace,
      'get',
      'deployment',
      deployment.metadata.name,
      '-o',
      'json',
    ]);

    if (
      canonical(
        live.spec.template.spec.containers.map(({ name, image }) => ({
          name,
          image,
        })),
      ) !==
      canonical(
        deployment.spec.template.spec.containers.map(({ name, image }) => ({
          name,
          image,
        })),
      )
    ) {
      fail('LIVE_IMAGE_DRIFT');
    }
  }

  /*
   * Set BEFORE the first mutation. --atomic on the final upgrade returns only
   * to this intermediate release; the workflow must restore INITIAL_REVISION.
   */
  const receipt = {
    targetSha: plan.sourceSha,
    initialRevision: env.INITIAL_REVISION,
    oldApiImage: oldApi[0].spec.template.spec.containers[0].image,
    migrationImage: `${registry}/api@${plan.migrationDigest}`,
    managerImage: image,
    phase: 'upgrade-requested',
  };
  const record = () => {
    if (env.RUNNER_TEMP) {
      writeFileSync(join(env.RUNNER_TEMP, 'manager-stage.json'), JSON.stringify(receipt, null, 2) + '\n');
    }
  };
  record();
  appendFileSync(env.GITHUB_ENV, 'STAGED_UPGRADE_STARTED=1\n');
  stageCommand(command, 'upgrade-manager', upgradeArgs);
  receipt.phase = 'upgrade-returned';
  record();

  const migrationName = `${release}-vibecore-platform-prisma-migrate`;

  const migrationJob = stageJson(command, 'read-migration-job', [
    '-n',
    namespace,
    'get',
    'job',
    migrationName,
    '-o',
    'json',
  ]);
  receipt.migrationJob = assertMigrationComplete(migrationJob, migrationName, receipt.migrationImage);
  receipt.phase = 'migration-job-verified';
  record();

  /*
   * Helm's availability threshold can be weaker than complete rollout. Keep
   * the established drain budget before the stricter replica/image attestation.
   */
  receipt.managerReadiness = waitForManagerReady({
    command,
    namespace,
    release,
    managerName,
    image,
    digest: plan.managerDigest,
    now,
    pause,
  });
  receipt.phase = 'manager-ready';
  record();

  return {
    migrationDigest: plan.migrationDigest,
    managerDigest: plan.managerDigest,
    initialRevision: env.INITIAL_REVISION,
    managerReadiness: receipt.managerReadiness,
    migrationJob: receipt.migrationJob,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(
      JSON.stringify(
        runStage({
          manifest: JSON.parse(readFileSync('release-manifest.json', 'utf8')),
        }),
      ),
    );
  } catch (error) {
    // Child command errors can embed rendered release values. Emit only our bounded codes.
    console.error(error.message?.startsWith('STAGED_MANAGER_') ? error.message : 'STAGED_MANAGER_COMMAND_FAILED');
    process.exitCode = 1;
  }
}
