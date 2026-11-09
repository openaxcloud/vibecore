import { execFile } from 'node:child_process';
import { mkdir, cp, copyFile, readFile, writeFile, chmod } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createIsolationEvidence, saveIsolationEvidence, isolationEvidenceName } from './runtime-browser-evidence.mjs';
import { startRelay } from './runtime-browser-relay.mjs';
import { guard } from './runtime-network-sentinel.mjs';

const evidence = createIsolationEvidence();

let phase = 'guard';
let evidenceDirectory;

const evidenceName = isolationEvidenceName(process.argv[2]);

async function record(result) {
  evidence.record(phase, result);

  if (evidenceDirectory) {
    await saveIsolationEvidence(evidenceDirectory, evidenceName, evidence);
  }
}

async function begin(next) {
  phase = next;
  await record('started');
}
export const IMAGE =
  'mcr.microsoft.com/playwright@sha256:eac9b0a5312cdab40ee8c2429df5bf19bffdccf8f3bf3c42268e173f97541645';
export const PORTS = Object.freeze([3001, 3020, 5173, 5174, 18083, 18084]);

const exec = promisify(execFile);

export function containerArguments(root, uid, gid, name, owner) {
  if (
    !/^\/[a-zA-Z0-9_./-]+$/.test(root) ||
    !Number.isInteger(uid) ||
    uid <= 0 ||
    !Number.isInteger(gid) ||
    gid <= 0 ||
    !/^runtime-browser-\d+-\d+$/.test(name) ||
    !/^[a-f0-9-]{36}$/.test(owner ?? '')
  ) {
    throw new Error('runtime_browser_configuration');
  }

  return [
    'run',
    '--detach',
    '--init',
    '--name',
    name,
    '--cidfile',
    join(root, 'container.id'),
    '--label',
    `vibecore.ci.browser-owner=${owner}`,
    '--platform',
    'linux/amd64',
    '--network',
    'bridge',
    '--user',
    `${uid}:${gid}`,
    '--cap-drop=ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--shm-size=256m',
    '--tmpfs',
    '/tmp:rw,nosuid,size=1g',
    '--env',
    'HOME=/tmp',
    '--mount',
    `type=bind,src=${root}/code,dst=/opt/ci,readonly`,
    '--mount',
    `type=bind,src=${root}/transport,dst=/transport`,
    IMAGE,
    'node',
    '/opt/ci/runtime-browser-container.mjs',
  ];
}
export async function cleanupOwnedContainer(root, owner, command = exec, read = readFile) {
  if (!/^[a-f0-9-]{36}$/.test(owner ?? '')) {
    return false;
  }

  const saved = (await read(join(root, 'owner'), 'utf8').catch(() => '')).trim();

  if (saved !== owner) {
    return false;
  }

  const state = async (name) => {
    try {
      return { text: await read(join(root, name), 'utf8') };
    } catch (error) {
      return { missing: error?.code === 'ENOENT' };
    }
  };

  const cid = await state('container.id');

  if (cid.missing) {
    const attempt = await state('creation-attempted');
    return attempt.missing ? 'not_attempted' : false;
  }

  const id = cid.text?.trim();

  if (!id || !/^[a-f0-9]{64}$/.test(id)) {
    return false;
  }

  const observed = await command(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "vibecore.ci.browser-owner"}}', id],
    { timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 4096 },
  ).catch(() => null);

  if (!observed) {
    const remaining = await command(
      'docker',
      ['ps', '--all', '--no-trunc', '--filter', `id=${id}`, '--format', '{{.ID}}'],
      { timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 4096 },
    ).catch(() => null);
    return remaining?.stdout.trim() === '' ? 'absent' : false;
  }

  if (observed.stdout.trim() !== owner) {
    return false;
  }

  await command('docker', ['rm', '--force', id], { timeout: 6000, killSignal: 'SIGKILL', maxBuffer: 4096 });

  return 'removed';
}
export async function waitForBrowserServer(probe, timeout = 30000) {
  const until = Date.now() + timeout;

  while (Date.now() < until) {
    let timer;

    try {
      const ready = await Promise.race([
        Promise.resolve().then(probe),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, until - Date.now()));
        }),
      ]);

      if (ready) {
        return;
      }
    } finally {
      clearTimeout(timer);
    }
    await delay(Math.min(250, Math.max(0, until - Date.now())));
  }
  throw new Error('runtime_browser_readiness');
}

function probeServer() {
  return new Promise((resolve) => {
    const request = http.get('http://127.0.0.1:18082/runtime-browser', { timeout: 1000 }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        if (body.length < 64) {
          body += chunk.toString().slice(0, 64);
        }
      });
      response.on('end', () => resolve(response.statusCode === 200 && body === 'Running'));
      response.on('error', () => resolve(false));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

export function processIdentity(stat, expectedPid) {
  const end = stat.lastIndexOf(')');
  const pid = Number(stat.slice(0, stat.indexOf(' ')));

  const start = stat
    .slice(end + 2)
    .trim()
    .split(/\s+/)[19];

  if (end < 0 || pid !== expectedPid || !Number.isInteger(pid) || pid <= 1 || !/^\d+$/.test(start ?? '')) {
    throw new Error('runtime_browser_process_identity');
  }

  return { pid, start };
}

// pidfd pins the instance; there is no fallback to a numeric-PID signal.
export const SUPERVISOR_STOP_PYTHON = `
import os, signal, select, json, sys
class RealOps:
    def read_start(self, pid):
        try:
            with open('/proc/%d/stat' % pid) as source: text = source.read()
        except FileNotFoundError: return None
        return text[text.rfind(')') + 2:].split()[19]
    def open(self, pid): return os.pidfd_open(pid)
    def close(self, fd): os.close(fd)
    def signal(self, fd, sig): signal.pidfd_send_signal(fd, sig)
    def exited(self, fd, timeout):
        poll = select.poll()
        poll.register(fd, select.POLLIN)
        return bool(poll.poll(timeout))
def stop_supervisor(identity, ops):
    pid, start = identity['pid'], identity['start']
    if type(pid) is not int or pid <= 1 or not isinstance(start, str) or not start.isdigit(): raise ValueError('identity')
    try: fd = ops.open(pid)
    except ProcessLookupError: return
    try:
        if ops.exited(fd, 0) or ops.read_start(pid) != start: return
        try: ops.signal(fd, signal.SIGTERM)
        except ProcessLookupError: return
        if ops.exited(fd, 18000): return
        if ops.exited(fd, 0) or ops.read_start(pid) != start: return
        try: ops.signal(fd, signal.SIGKILL)
        except ProcessLookupError: return
        if not ops.exited(fd, 1000): raise RuntimeError('stop_unconfirmed')
    finally: ops.close(fd)
`;
export async function stopOwnedSupervisor(root, owner, command = exec, read = readFile) {
  const savedOwner = (await read(join(root, 'owner'), 'utf8').catch(() => '')).trim();

  if (savedOwner !== owner || !/^[a-f0-9-]{36}$/.test(owner ?? '')) {
    throw new Error('runtime_browser_supervisor_owner');
  }

  const identity = JSON.parse(await read(join(root, 'supervisor.json'), 'utf8'));

  if (!Number.isInteger(identity.pid) || identity.pid <= 1 || !/^\d+$/.test(identity.start ?? '')) {
    throw new Error('runtime_browser_process_identity');
  }

  await command(
    'python3',
    [
      '-c',
      SUPERVISOR_STOP_PYTHON + '\nstop_supervisor(json.loads(sys.argv[1]), RealOps())\n',
      JSON.stringify({ pid: identity.pid, start: identity.start }),
    ],
    { timeout: 21000, killSignal: 'SIGKILL', maxBuffer: 4096 },
  );
}

async function run() {
  guard(process.env);
  evidenceDirectory = join(process.env.RUNNER_TEMP, 'vibecore-runtime/evidence');
  await record('succeeded');

  if (
    process.env.VIBECORE_CI_BROWSER_ISOLATION !== '1' ||
    !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '') ||
    !/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? '')
  ) {
    throw new Error('runtime_browser_guard');
  }

  const root = join(
    process.env.RUNNER_TEMP,
    `runtime-browser-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
  );

  const name = `runtime-browser-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  const owner = process.env.RUNTIME_BROWSER_OWNER;

  if (!/^[a-f0-9-]{36}$/.test(owner ?? '')) {
    throw new Error('runtime_browser_owner');
  }

  if (process.argv[2] === '--stop-supervisor') {
    await begin('supervisor');
    await stopOwnedSupervisor(root, owner);
    await record('succeeded');

    return;
  }

  if (process.argv[2] === '--cleanup') {
    await begin('cleanup');

    const cleaned = await cleanupOwnedContainer(root, owner);

    if (cleaned === 'removed') {
      evidence.verify('ownership');
    }

    await record(cleaned ? 'succeeded' : 'unconfirmed');

    if (!cleaned) {
      throw new Error('runtime_browser_cleanup_owner');
    }

    return;
  }

  await begin('staging');
  await mkdir(root, { mode: 0o700 });
  await writeFile(join(root, 'owner'), owner, { mode: 0o600, flag: 'wx' });

  const identity = processIdentity(await readFile('/proc/self/stat', 'utf8'), process.pid);
  await writeFile(join(root, 'supervisor.json'), JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
  await mkdir(join(root, 'code'), { mode: 0o700 });
  await mkdir(join(root, 'transport'), { mode: 0o700 });

  const localRequire = createRequire(import.meta.url);
  const testRequire = createRequire(localRequire.resolve('@playwright/test'));
  const playwrightRequire = createRequire(testRequire.resolve('playwright'));
  const core = dirname(playwrightRequire.resolve('playwright-core/package.json'));

  if (JSON.parse(await readFile(join(core, 'package.json'), 'utf8')).version !== '1.59.1') {
    throw new Error('runtime_browser_version');
  }

  evidence.verify('clientVersion');
  await cp(core, join(root, 'code', 'playwright-core'), { recursive: true });

  for (const file of ['runtime-browser-container.mjs', 'runtime-browser-relay.mjs']) {
    await copyFile(new URL(file, import.meta.url), join(root, 'code', file));
  }
  await chmod(join(root, 'code'), 0o700);

  const relays = [];

  let stopping = false;
  let deadline;

  const controller = new AbortController();

  const stop = async (code) => {
    if (stopping) {
      return;
    }

    stopping = true;
    clearTimeout(deadline);
    controller.abort();

    const timer = setTimeout(() => process.exit(1), 15000);
    await Promise.allSettled(relays.map((relay) => relay.close()));
    await begin('cleanup').catch(() => {});

    let cleanupFailed = false;
    let cleaned = false;
    await cleanupOwnedContainer(root, owner)
      .then((value) => {
        cleaned = value;

        if (value === 'removed') {
          evidence.verify('ownership');
        }
      })
      .catch(() => {
        cleanupFailed = true;
      });
    cleanupFailed ||= !cleaned;
    await record(cleaned ? 'succeeded' : 'unconfirmed').catch(() => {
      cleanupFailed = true;
    });
    clearTimeout(timer);
    process.exit(cleanupFailed ? 1 : code);
  };
  process.once('SIGTERM', () => void stop(0));
  process.once('SIGINT', () => void stop(0));
  deadline = setTimeout(() => void stop(1), 90 * 60_000);

  try {
    await begin('relays');

    for (const port of PORTS) {
      relays.push(
        await startRelay({
          idleTimeoutMs: 90 * 60_000,
          listen: { path: join(root, 'transport', `service-${port}.sock`) },
          target: { host: '127.0.0.1', port },
        }),
      );
    }
    relays.push(
      await startRelay({
        idleTimeoutMs: 90 * 60_000,
        listen: { host: '127.0.0.1', port: 18082 },
        target: { path: join(root, 'transport', 'control.sock') },
      }),
    );
    await begin('image');
    evidence.verify('immutableImageArgument');
    await exec('docker', ['pull', '--platform', 'linux/amd64', IMAGE], {
      signal: controller.signal,
      timeout: 180000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    });
    await begin('container');
    evidence.verify('nonRootArguments');

    // Persist intent before Docker can create anything, including an interrupted response.
    await writeFile(join(root, 'creation-attempted'), 'attempted\n', { mode: 0o600, flag: 'wx' });
    await exec('docker', containerArguments(root, process.getuid(), process.getgid(), name, owner), {
      signal: controller.signal,
      timeout: 30000,
      killSignal: 'SIGKILL',
      maxBuffer: 4096,
    });
    await begin('readiness');
    await waitForBrowserServer(probeServer);
    evidence.verify('serverReachable');
    await begin('ready');
    await record('succeeded');
    await writeFile(join(root, 'started'), 'started\n', { mode: 0o600 });
  } catch {
    await record('failed').catch(() => {});
    await stop(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(async () => {
    await record('failed').catch(() => {});
    process.exit(1);
  });
}
