import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { redactRuntimeEvidence } from './runtime-evidence-redaction.mjs';

export const OUTPUT = 'tmp/runtime-network-sentinel.json';
export const MAX_BYTES = 32 * 1024;

export const LIMITS = Object.freeze({ main: 145000, settle: 4000, close: 2000, cleanup: 18000, podHold: 5000 });

const sleep = (ms, signal) => delay(ms, undefined, { signal });

export async function settleSampling(promise, timeout = LIMITS.settle) {
  let timer;

  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('sentinel_sampling_timeout')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function guard(env) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.VIBECORE_CI_EPHEMERAL_RUNTIME !== '1' ||
    !env.KUBECONFIG ||
    !env.RUNNER_TEMP ||
    env.KUBECONFIG !== `${env.RUNNER_TEMP}/vibecore-runtime/kubeconfig` ||
    !/^vibecore\/workspace-agent:ci-[a-f0-9]{40}$/.test(env.WORKSPACE_AGENT_IMAGE ?? '')
  ) {
    throw new Error('sentinel_guard');
  }
}
export function phaseReport() {
  return {
    startedAt: Date.now(),
    endedAt: null,
    node: { attempted: 0, succeeded: 0, failed: 0 },
    chromium: { attempted: 0, succeeded: 0, failed: 0, networkChanged: 0 },
    network: { address: 0, link: 0 },
    events: [],
    omittedEvents: 0,
  };
}
export function recordEvent(phase, type, time = Date.now()) {
  if (!phase || !['address', 'link', 'networkChanged'].includes(type)) {
    return;
  }

  if (type === 'networkChanged') {
    phase.chromium.networkChanged++;
  } else {
    phase.network[type]++;
  }

  if (phase.events.length < 128) {
    phase.events.push({ time, type, count: 1 });
  } else {
    phase.omittedEvents++;
  }
}

// Each bounded line is classified immediately; raw interface/address text is never retained.
export function monitorProjection(onEvent) {
  let line = '';
  let overflow = false;

  return (chunk) => {
    for (const char of String(chunk)) {
      if (char === '\n') {
        if (!overflow) {
          if (/\binet6?\b/.test(line)) {
            onEvent('address');
          } else if (/^(?:Deleted\s+)?\d+:/.test(line)) {
            onEvent('link');
          }
        }

        line = '';
        overflow = false;
      } else if (line.length < 4096 && !overflow) {
        line += char;
      } else {
        line = '';
        overflow = true;
      }
    }
  };
}
export function serializeReport(report, credentials = []) {
  const text = redactRuntimeEvidence(JSON.stringify(report), credentials);

  if (Buffer.byteLength(text) > MAX_BYTES) {
    throw new Error('sentinel_output_limit');
  }

  return text;
}

function command(args, input, signal, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const child = spawn('kubectl', [...args, '--request-timeout=7s'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      signal,
      killSignal: 'SIGKILL',
    });

    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('sentinel_kubectl'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error('sentinel_kubectl'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function recordCycleBoundary(records, cycle, boundary, time = Date.now()) {
  if (
    !Number.isInteger(cycle) ||
    cycle < 0 ||
    cycle > 2 ||
    !['createStart', 'ready', 'deleteComplete'].includes(boundary) ||
    !Number.isFinite(time)
  ) {
    return;
  }

  let record = records.find((item) => item.cycle === cycle);

  if (!record) {
    if (records.length >= 3) {
      return;
    }

    record = { cycle, createStart: null, ready: null, deleteComplete: null };
    records.push(record);
  }

  if (record[boundary] === null) {
    record[boundary] = time;
  }
}

export async function cycles(create, remove, signal, onComplete = () => {}) {
  let completed = 0;

  for (let index = 0; index < 3; index++) {
    signal.throwIfAborted();

    try {
      await create(index);
    } finally {
      await remove(index);
    }
    completed++;
    onComplete(completed);
  }

  return completed;
}
export async function run(env = process.env) {
  guard(env);

  const report = {
    diagnosticOnly: true,
    status: 'incomplete',
    completedCycles: 0,
    cycleBoundaries: [],
    monitorAvailable: false,
    phases: {},
  };

  const owner = randomUUID();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), LIMITS.main);

  let phase;
  let browser;
  let monitor;
  let monitorStopping = false;

  const server = http.createServer((request, response) => {
    response.setHeader('connection', 'close');

    if (request.url === '/') {
      response.end('<!doctype html><title>Loopback sentinel</title>');
      return;
    }

    setTimeout(() => {
      if (!response.destroyed) {
        response.setHeader('cache-control', 'no-store');
        response.end('sentinel');
      }
    }, 400);
  });

  let sampling;
  let stopSampling = false;

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const origin = `http://127.0.0.1:${server.address().port}`;
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true, timeout: 10000 });
    controller.signal.addEventListener(
      'abort',
      () => {
        void browser.close().catch(() => {});
      },
      { once: true },
    );

    const page = await browser.newPage();
    await page.goto(origin, { timeout: 5000 });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText === 'net::ERR_NETWORK_CHANGED') {
        recordEvent(phase, 'networkChanged');
      }
    });
    monitor = spawn('ip', ['-o', 'monitor', 'address', 'link'], { stdio: ['ignore', 'pipe', 'ignore'] });
    monitor.on('spawn', () => {
      report.monitorAvailable = true;
    });
    monitor.on('error', () => {
      report.monitorAvailable = false;
    });
    monitor.on('exit', () => {
      if (!monitorStopping) {
        report.monitorAvailable = false;
      }
    });
    monitor.stdout.on(
      'data',
      monitorProjection((type) => recordEvent(phase, type)),
    );

    async function sample(current) {
      for (const client of ['node', 'chromium']) {
        current[client].attempted++;
      }
      await Promise.all([
        fetch(`${origin}/sentinel`, { signal: AbortSignal.timeout(3000) })
          .then(async (response) => response.ok && (await response.text()) === 'sentinel')
          .catch(() => false)
          .then((ok) => {
            current.node[ok ? 'succeeded' : 'failed']++;
          }),
        page
          .evaluate(async () => {
            try {
              const response = await fetch('/sentinel', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
              return response.ok && (await response.text()) === 'sentinel';
            } catch {
              return false;
            }
          })
          .catch(() => false)
          .then((ok) => {
            current.chromium[ok ? 'succeeded' : 'failed']++;
          }),
      ]);
    }

    async function measure(name, work) {
      phase = report.phases[name] = phaseReport();

      const current = phase;
      stopSampling = false;
      sampling = (async () => {
        for (let i = 0; i < 240 && !stopSampling && !controller.signal.aborted; i++) {
          await Promise.all(Array.from({ length: 4 }, () => sample(current)));
          await sleep(25);
        }
      })();

      try {
        await work();
      } finally {
        stopSampling = true;

        try {
          await settleSampling(sampling);
        } finally {
          current.endedAt = Date.now();
          phase = undefined;
        }
      }
    }

    const remove = async (index, signal = controller.signal) => {
      await command(
        [
          '-n',
          'workspaces',
          'delete',
          'pod',
          '-l',
          `vibecore-ci-sentinel-owner=${owner},vibecore-ci-sentinel-cycle=${index}`,
          '--ignore-not-found=true',
          '--wait=true',
          '--timeout=7s',
        ],
        undefined,
        signal,
      );
      recordCycleBoundary(report.cycleBoundaries, index, 'deleteComplete');
    };
    await measure('baseline', () => sleep(10000, controller.signal));
    await measure('mutation', async () => {
      report.completedCycles = await cycles(
        async (index) => {
          const name = `runtime-network-sentinel-${index}`;

          const pod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name,
              namespace: 'workspaces',
              labels: {
                'app.kubernetes.io/name': 'runtime-network-sentinel',
                'vibecore-ci-sentinel-owner': owner,
                'vibecore-ci-sentinel-cycle': String(index),
              },
            },
            spec: {
              runtimeClassName: 'gvisor',
              nodeSelector: { 'vibecore.ai/node-pool': 'sandbox' },
              restartPolicy: 'Never',
              automountServiceAccountToken: false,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                runAsGroup: 1000,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              containers: [
                {
                  name: 'sentinel',
                  image: env.WORKSPACE_AGENT_IMAGE,
                  imagePullPolicy: 'Never',
                  command: ['node', '-e', 'setInterval(() => {}, 1000)'],
                  resources: { requests: { cpu: '50m', memory: '32Mi' }, limits: { cpu: '200m', memory: '128Mi' } },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: { drop: ['ALL'] },
                  },
                },
              ],
            },
          };
          recordCycleBoundary(report.cycleBoundaries, index, 'createStart');
          await command(['create', '-f', '-'], JSON.stringify(pod), controller.signal);
          await command(
            ['-n', 'workspaces', 'wait', '--for=condition=Ready', `pod/${name}`, '--timeout=12s'],
            undefined,
            controller.signal,
            13000,
          );
          recordCycleBoundary(report.cycleBoundaries, index, 'ready');
          await sleep(LIMITS.podHold, controller.signal);
        },
        remove,
        controller.signal,
        (count) => {
          report.completedCycles = count;
        },
      );
    });
    await measure('recovery', () => sleep(10000, controller.signal));
    report.status = report.monitorAvailable ? 'completed' : 'observer_unavailable';
  } catch {
    report.status = controller.signal.aborted ? 'deadline' : 'setup_or_cycle_failed';
  } finally {
    clearTimeout(deadline);
    controller.abort();
    stopSampling = true;
    monitorStopping = true;
    monitor?.kill('SIGKILL');
    await Promise.race([browser?.close().catch(() => {}), sleep(LIMITS.close)]);
    await Promise.race([sampling?.catch(() => {}), sleep(LIMITS.close)]);
    server.closeAllConnections();
    server.close();

    try {
      await command(
        [
          '-n',
          'workspaces',
          'delete',
          'pod',
          '-l',
          `vibecore-ci-sentinel-owner=${owner}`,
          '--ignore-not-found=true',
          '--wait=true',
          '--timeout=15s',
        ],
        undefined,
        AbortSignal.timeout(LIMITS.cleanup),
        LIMITS.cleanup,
      );
      report.cleanup = 'completed';
    } catch {
      report.cleanup = 'failed';
    }
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await run().catch(() => ({ diagnosticOnly: true, status: 'guard_rejected' }));
  await mkdir('tmp', { recursive: true });
  await writeFile(
    OUTPUT,
    serializeReport(
      report,
      ['WORKSPACE_AGENT_TOKEN_SECRET', 'WORKSPACE_MANAGER_SHARED_SECRET', 'PREVIEW_PROXY_SHARED_SECRET']
        .map((key) => process.env[key])
        .filter(Boolean),
    ),
  );

  if (report.status !== 'completed' || report.cleanup !== 'completed') {
    process.exitCode = 1;
  }
}
