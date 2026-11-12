import { pathToFileURL } from 'node:url';

const maxInputBytes = 1024 * 1024;
const maxPods = 256;
const maxRows = 16;
const phases = new Set(['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* No raw values or exception messages may cross this projection boundary. */
function refuse() {
  throw new Error();
}

function validatePod(pod) {
  if (!isRecord(pod)) {
    refuse();
  }

  for (const value of [pod.status, pod.spec]) {
    if (value !== undefined && value !== null && !isRecord(value)) {
      refuse();
    }
  }

  const status = pod.status ?? {};

  // Null entries would throw in the production predicate; refuse the observation.
  for (const value of [
    status.conditions,
    status.containerStatuses,
    status.initContainerStatuses,
    status.ephemeralContainerStatuses,
  ]) {
    if (Array.isArray(value) && value.some((entry) => !isRecord(entry))) {
      refuse();
    }
  }
}

const terminated = (container) =>
  Boolean(
    container?.state?.terminated &&
      typeof container.state.terminated === 'object' &&
      Number.isInteger(container.state.terminated.exitCode) &&
      !container.state.running &&
      !container.state.waiting,
  );

const count = (values, predicate) => (Array.isArray(values) ? values.filter(predicate).length : 0);

function containers(values) {
  return {
    absent: values === undefined,
    array: Array.isArray(values),
    count: Array.isArray(values) ? values.length : 0,
    terminatedObject: count(values, (value) =>
      Boolean(value?.state?.terminated && typeof value.state.terminated === 'object'),
    ),
    integerExitCode: count(values, (value) => Number.isInteger(value?.state?.terminated?.exitCode)),
    runningPresent: count(values, (value) => Boolean(value?.state?.running)),
    waitingPresent: count(values, (value) => Boolean(value?.state?.waiting)),
    readyFalse: count(values, (value) => value?.ready === false),
    fullyTerminated: count(values, terminated),
  };
}

/** Diagnostic conjunction mirrors terminalManagerPod, never changes its decision. */
export function projectPod(pod) {
  validatePod(pod);

  const status = pod.status ?? {};
  const main = status.containerStatuses;
  const init = status.initContainerStatuses;
  const ephemeral = status.ephemeralContainerStatuses;
  const conditions = status.conditions;

  const required = {
    terminalPhase: ['Failed', 'Succeeded'].includes(status.phase),
    conditionsArray: Array.isArray(conditions),
    readyFalsePresent:
      Array.isArray(conditions) && conditions.some((value) => value.type === 'Ready' && value.status === 'False'),
    readyTrueAbsent:
      Array.isArray(conditions) && !conditions.some((value) => value.type === 'Ready' && value.status === 'True'),
    mainStatusesArray: Array.isArray(main),
    mainStatusesNonempty: Array.isArray(main) && main.length > 0,
    mainStatusCountMatchesSpec: Array.isArray(main) && main.length === pod.spec?.containers?.length,
    mainAllNotReadyAndTerminated:
      Array.isArray(main) && main.every((value) => value.ready === false && terminated(value)),
    initAbsentOrAllTerminated: init === undefined || (Array.isArray(init) && init.every(terminated)),
    ephemeralAbsentOrAllTerminated:
      ephemeral === undefined || (Array.isArray(ephemeral) && ephemeral.every(terminated)),
  };

  return {
    phase: phases.has(status.phase) ? status.phase : 'Unknown',
    terminal: Object.values(required).every(Boolean),
    required,
    specContainersArray: Array.isArray(pod.spec?.containers),
    specContainersCount: Array.isArray(pod.spec?.containers) ? pod.spec.containers.length : 0,
    main: containers(main),
    init: containers(init),
    ephemeral: containers(ephemeral),
  };
}

export function projectList(value) {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > maxPods) {
    refuse();
  }

  const rows = value.items.map(projectPod);
  const failed = rows.filter((row) => row.phase === 'Failed');
  const missing = {};

  for (const row of failed) {
    for (const [key, ok] of Object.entries(row.required)) {
      if (!ok) {
        missing[key] = (missing[key] ?? 0) + 1;
      }
    }
  }

  return {
    schemaVersion: 1,
    total: rows.length,
    failed: failed.length,
    terminal: rows.filter((row) => row.terminal).length,
    failedTerminal: failed.filter((row) => row.terminal).length,
    missingConditionsAmongFailed: missing,
    omitted: Math.max(0, rows.length - maxRows),
    pods: rows.slice(0, maxRows),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // No filenames, target overrides or commands are accepted.
    if (process.argv.length !== 2) {
      refuse();
    }

    const chunks = [];

    let bytes = 0;

    for await (const chunk of process.stdin) {
      bytes += chunk.length;

      if (bytes > maxInputBytes) {
        refuse();
      }

      chunks.push(chunk);
    }

    const input = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const output = JSON.stringify(projectList(JSON.parse(input)));
    process.stdout.write(`${output}\n`);
  } catch {
    process.stderr.write('TERMINAL_DIAGNOSTIC_UNAVAILABLE\n');
    process.exitCode = 1;
  }
}
