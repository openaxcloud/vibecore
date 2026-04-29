import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import { spawn, type ChildProcess } from 'node:child_process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const apiBaseUrl = (process.env.RUNTIME_API_E2E_API_URL ?? process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
const runtimeBaseUrl = (process.env.RUNTIME_API_E2E_RUNTIME_URL ?? `${apiBaseUrl}/api/runtime`).replace(/\/+$/, '');
const namespace = process.env.RUNTIME_API_E2E_NAMESPACE ?? process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces';
const agentLocalPort = Number(process.env.RUNTIME_API_E2E_AGENT_PORT ?? '18081');
const password = process.env.RUNTIME_API_E2E_PASSWORD ?? 'RuntimeApiE2E!12345';
let portForward: ChildProcess | undefined;

async function main() {
  const runId = Date.now();
  const auth = await registerUser({
    email: `runtime-api-e2e-${runId}@vibecore.local`,
    password,
    name: 'Runtime API E2E',
    organizationName: `Runtime API E2E ${runId}`,
  });
  const project = await api<{ project: { id: string; name: string } }>(
    `/orgs/${auth.organization.id}/projects`,
    auth.token,
    {
      method: 'POST',
      body: JSON.stringify({ name: `Runtime API E2E ${runId}` }),
    },
  );

  const adapter = new RemoteKubernetesRuntimeAdapter({
    baseUrl: runtimeBaseUrl,
    authToken: auth.token,
    workspaceId: project.project.id,
  });

  await adapter.boot();
  const session = await adapter.startWorkspace({ id: project.project.id, metadata: { projectId: project.project.id, validation: 'runtime-api-kubernetes' } });
  assert(session.status === 'running', `workspace did not start: ${JSON.stringify(session)}`);

  portForward = await startPortForward(project.project.id);

  await adapter.writeFile('src/index.js', 'console.log("runtime-api-kubernetes")\n');
  const content = await adapter.readFile('src/index.js');
  assert(content.includes('runtime-api-kubernetes'), 'readFile did not return content written through the API runtime');

  await adapter.createFile('README.md', '# Runtime API Kubernetes\n');
  const files = await adapter.listFiles();
  assert(files.length > 0, 'listFiles returned no files');

  const matches = await adapter.searchFiles('Runtime API Kubernetes');
  assert(matches.some((match) => match.path === 'README.md'), 'searchFiles did not find README.md content');

  const patch = await adapter.applyPatch({
    operations: [{ type: 'write', path: 'src/patched.txt', content: 'patched via real API runtime\n' }],
  });
  assert(patch.some((change) => change.path === 'src/patched.txt'), 'applyPatch did not report src/patched.txt');

  const command = await adapter.runCommand({ command: 'node', args: ['-e', 'console.log("command-through-runtime-api")'] });
  assert(command.exitCode === 0 && command.output.includes('command-through-runtime-api'), `runCommand failed: ${JSON.stringify(command)}`);

  const terminal = await adapter.openTerminal({ terminal: { cols: 100, rows: 30 } });
  const terminalEvent = await nextEvent(terminal.events, 10_000);
  assert(terminalEvent.type === 'stdout' && String(terminalEvent.data).includes('ready'), `terminal did not become ready: ${JSON.stringify(terminalEvent)}`);
  await terminal.kill();

  const ports = await adapter.listPorts();
  assert(Array.isArray(ports), 'listPorts did not return an array');

  const preview = await adapter.getPreviewUrl(8080);
  assert(preview.ready && preview.url.length > 0, `getPreviewUrl failed: ${JSON.stringify(preview)}`);

  const snapshot = await adapter.createSnapshot('runtime-api-e2e');
  assert(snapshot.files.some((file) => file.path === 'src/index.js'), 'createSnapshot did not include src/index.js');

  const zip = await adapter.exportZip();
  assert(zip.byteLength > 0, 'exportZip returned an empty zip');
  await adapter.importZip(zip, 'imported');
  assert((await adapter.readFile('imported/src/index.js')).includes('runtime-api-kubernetes'), 'importZip did not restore src/index.js');

  await adapter.stopWorkspace();
  portForward?.kill();
  portForward = undefined;

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBaseUrl,
        runtimeBaseUrl,
        namespace,
        projectId: project.project.id,
        workspaceId: session.id,
        checks: [
          'auth/register',
          'project/create',
          'runtime/boot',
          'workspace/start',
          'file read/write/list/search',
          'patch',
          'command',
          'terminal websocket',
          'ports/preview',
          'snapshot',
          'zip export/import',
          'workspace/stop',
        ],
      },
      null,
      2,
    ),
  );
}

async function registerUser(input: { email: string; password: string; name: string; organizationName: string }) {
  return api<{
    token: string;
    organization: { id: string };
  }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function api<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${payload}`);
  }

  return JSON.parse(payload) as T;
}

async function startPortForward(workspaceId: string) {
  await execFile('kubectl', ['-n', namespace, 'wait', '--for=condition=Ready', `pod/workspace-${workspaceId}`, '--timeout=180s'], {
    maxBuffer: 20 * 1024 * 1024,
  });

  const child = spawn('kubectl', ['-n', namespace, 'port-forward', `service/workspace-${workspaceId}`, `${agentLocalPort}:8080`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });

  await waitFor(() => {
    if (child.exitCode !== null) {
      throw new Error(`kubectl port-forward exited early: ${output}`);
    }

    return output.includes(`:${agentLocalPort}`) || output.includes(`127.0.0.1:${agentLocalPort}`);
  }, 30_000);

  return child;
}

async function nextEvent<T>(events: AsyncIterable<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    events[Symbol.asyncIterator]().next().then((result) => {
      if (result.done) {
        throw new Error('event stream closed');
      }

      return result.value;
    }),
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timed out waiting for runtime event')), timeoutMs)),
  ]);
}

async function waitFor(predicate: () => boolean, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`timed out after ${timeoutMs}ms`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

process.on('exit', () => {
  portForward?.kill();
});

main().catch((error) => {
  portForward?.kill();
  console.error(error);
  process.exit(1);
});
