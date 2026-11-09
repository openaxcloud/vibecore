import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const phases = ['guard', 'staging', 'relays', 'image', 'container', 'readiness', 'ready', 'cleanup', 'supervisor'];
const results = ['started', 'succeeded', 'failed', 'unconfirmed'];

export function isolationEvidenceName(mode) {
  if (mode === undefined) {
    return 'runtime-browser-setup.json';
  }

  if (mode === '--stop-supervisor') {
    return 'runtime-browser-stop.json';
  }

  if (mode === '--cleanup') {
    return 'runtime-browser-cleanup.json';
  }

  throw new Error('browser_evidence_mode');
}
export function createIsolationEvidence() {
  const events = [];

  const verified = {
    clientVersion: false,
    immutableImageArgument: false,
    nonRootArguments: false,
    serverReachable: false,
    ownership: false,
  };

  return {
    record(phase, result, time = Date.now()) {
      if (!phases.includes(phase) || !results.includes(result) || !Number.isFinite(time)) {
        return;
      }

      if (events.length === 16) {
        events.shift();
      }

      events.push({ phase, result, time });
    },
    verify(key) {
      if (Object.hasOwn(verified, key)) {
        verified[key] = true;
      }
    },
    snapshot() {
      return { diagnosticOnly: true, verified: { ...verified }, events: events.map((event) => ({ ...event })) };
    },
  };
}
export async function saveIsolationEvidence(directory, name, evidence, write = writeFile) {
  if (!['runtime-browser-setup.json', 'runtime-browser-stop.json', 'runtime-browser-cleanup.json'].includes(name)) {
    throw new Error('browser_evidence_name');
  }

  const text = JSON.stringify(evidence.snapshot());

  if (Buffer.byteLength(text) > 4096) {
    throw new Error('browser_evidence_limit');
  }

  let timer;

  try {
    await Promise.race([
      (async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await write(join(directory, name), text, { mode: 0o600 });
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('browser_evidence_timeout')), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
