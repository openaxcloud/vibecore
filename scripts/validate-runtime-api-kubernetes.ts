import { spawn, type ChildProcess } from 'node:child_process';
import { execFile as execFileCallback } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';

const execFile = promisify(execFileCallback);

const apiBaseUrl = (process.env.RUNTIME_API_E2E_API_URL ?? process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001').replace(
  /\/+$/,
  '',
);

const runtimeBaseUrl = (process.env.RUNTIME_API_E2E_RUNTIME_URL ?? `${apiBaseUrl}/api/runtime`).replace(/\/+$/, '');

const workspaceManagerBaseUrl = (
  process.env.RUNTIME_API_E2E_WORKSPACE_MANAGER_URL ??
  process.env.WORKSPACE_MANAGER_URL ??
  'http://127.0.0.1:3010'
).replace(/\/+$/, '');

const namespace = process.env.RUNTIME_API_E2E_NAMESPACE ?? process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces';
const agentLocalPort = Number(process.env.RUNTIME_API_E2E_AGENT_PORT ?? '18081');
const password = process.env.RUNTIME_API_E2E_PASSWORD ?? 'RuntimeApiE2E!12345';
const clusterName = process.env.E2E_RUNTIME_CLUSTER_NAME ?? '';
const kubeconfig = process.env.RUNTIME_API_E2E_KUBECONFIG ?? process.env.E2E_RUNTIME_KUBECONFIG ?? '';
const kubeContext = process.env.RUNTIME_API_E2E_KUBE_CONTEXT ?? (clusterName ? `kind-${clusterName}` : '');

let portForward: ChildProcess | undefined;

async function main() {
  await preflight();

  const runId = Date.now();
  const previewPort = 4173;

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

  const session = await adapter.startWorkspace({
    id: project.project.id,
    metadata: { projectId: project.project.id, validation: 'runtime-api-kubernetes' },
  });
  assert(session.status === 'running', `workspace did not start: ${JSON.stringify(session)}`);

  portForward = await startPortForward(session.id);

  await adapter.writeFile('src/index.js', 'console.log("runtime-api-kubernetes")\n');

  const { content } = await adapter.readFile('src/index.js');
  assert(content.includes('runtime-api-kubernetes'), 'readFile did not return content written through the API runtime');

  /*
   * Runtime start deliberately reseeds persisted project files (including the
   * default README).  Exercise the create-only contract with a run-scoped path
   * so the validator cannot fail merely because the real seed completed first.
   */
  const createdPath = `runtime-api-e2e-${runId}.md`;
  await adapter.createFile(createdPath, '# Runtime API Kubernetes\n');

  const files = await adapter.listFiles();
  assert(files.length > 0, 'listFiles returned no files');

  const matches = await adapter.searchFiles('Runtime API Kubernetes');
  assert(
    matches.some((match) => match.path === createdPath),
    `searchFiles did not find ${createdPath} content`,
  );

  const patch = await adapter.applyPatch({
    operations: [{ type: 'write', path: 'src/patched.txt', content: 'patched via real API runtime\n' }],
  });
  assert(
    patch.some((change) => change.path === 'src/patched.txt'),
    'applyPatch did not report src/patched.txt',
  );

  const command = await adapter.runCommand({
    command: 'node',
    args: ['-e', 'console.log("command-through-runtime-api")'],
  });
  assert(
    command.exitCode === 0 && command.output.includes('command-through-runtime-api'),
    `runCommand failed: ${JSON.stringify(command)}`,
  );

  const terminal = await adapter.openTerminal({ terminal: { cols: 100, rows: 30 } });

  /*
   * Drain terminal events until the jsh readiness marker appears rather than
   * asserting on the very first event: a real PTY emits shell-init output (and
   * the rcfile sources bashrc) before PROMPT_COMMAND/PS1 emit the OSC markers,
   * so the marker is rarely the first chunk.
   */
  const terminalReady = await waitForTerminalMarker(terminal.events, 25_000);
  assert(terminalReady, 'terminal did not become ready (no jsh prompt/interactive marker within 25s)');
  await terminal.kill();

  let previewServerError: Error | undefined;
  let previewServerFinished = false;
  let previewServerOutput = '';

  const previewServerTask = consumeCommandStream(
    adapter.streamCommand({
      command: 'node',
      args: [
        '-e',
        `require("node:http").createServer((_request,response)=>response.end("runtime-preview-ok")).listen(${previewPort},"0.0.0.0")`,
      ],
    }),
    (data) => {
      previewServerOutput = `${previewServerOutput}${data}`.slice(-8_192);
    },
  )
    .catch((error: unknown) => {
      previewServerError = error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => {
      previewServerFinished = true;
    });

  const ports = await waitForValue(
    async () => {
      if (previewServerError) {
        throw previewServerError;
      }

      if (previewServerFinished) {
        throw new Error(`preview server exited before opening its port: ${previewServerOutput}`);
      }

      const value = await adapter.listPorts();

      return value.some((port) => port.port === previewPort) ? value : undefined;
    },
    30_000,
    `workspace agent to report the real port ${previewPort}`,
  );
  assert(
    ports.some((port) => port.port === previewPort),
    `listPorts did not return the listening port ${previewPort}`,
  );

  const preview = await waitForValue(
    async () => {
      const value = await adapter.getPreviewUrl(previewPort);
      return value.ready ? value : undefined;
    },
    30_000,
    `preview route ${previewPort} to become ready`,
  );
  assert(preview.url.length > 0, `getPreviewUrl returned no URL: ${JSON.stringify(preview)}`);

  const previewResponse = await fetch(preview.url);
  const previewBody = await previewResponse.text();
  assert(
    previewResponse.ok && previewBody === 'runtime-preview-ok',
    `preview proxy did not reach the workspace server: ${previewResponse.status} ${previewBody}`,
  );

  const previewProcess = (await adapter.listProcesses()).find((process) =>
    process.command.includes('runtime-preview-ok'),
  );
  assert(previewProcess, 'listProcesses did not expose the running preview server');
  await adapter.killProcess(previewProcess.id);
  await previewServerTask;
  assert(!previewServerError, `preview server command stream failed: ${previewServerError?.message}`);

  const snapshot = await adapter.createSnapshot('runtime-api-e2e');
  assert(
    snapshot.files.some((file) => file.path === 'src/index.js'),
    'createSnapshot did not include src/index.js',
  );

  const zip = await adapter.exportZip();
  assert(zip.byteLength > 0, 'exportZip returned an empty zip');
  await adapter.importZip(zip, 'imported');
  assert(
    (await adapter.readFile('imported/src/index.js')).content.includes('runtime-api-kubernetes'),
    'importZip did not restore src/index.js',
  );

  await adapter.stopWorkspace();
  portForward?.kill();
  portForward = undefined;

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBaseUrl,
        runtimeBaseUrl,
        workspaceManagerBaseUrl,
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

async function preflight() {
  assert(
    clusterName.startsWith('vibecore-e2e-runtime-'),
    `refusing non-ephemeral runtime cluster name: ${clusterName || '<empty>'}`,
  );
  assert(isAbsolute(kubeconfig), 'E2E runtime validator requires an absolute, explicit kubeconfig path');
  assert(
    kubeContext === `kind-${clusterName}`,
    `E2E runtime context must match the guarded cluster name: ${kubeContext || '<empty>'}`,
  );

  await assertJsonHealth(`${apiBaseUrl}/health`, 'API');
  await assertJsonHealth(`${workspaceManagerBaseUrl}/health`, 'workspace-manager');

  try {
    await execFile('kubectl', ['--kubeconfig', kubeconfig, '--context', kubeContext, 'version', '--client=true'], {
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`kubectl client is required for runtime API Kubernetes validation: ${errorMessage(error)}`);
  }

  try {
    await execFile(
      'kubectl',
      ['--kubeconfig', kubeconfig, '--context', kubeContext, '-n', namespace, 'get', 'namespace', namespace],
      { maxBuffer: 2 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(
      `Kubernetes namespace "${namespace}" is not reachable. Configure the staging kube context and namespace before running runtime:validate:api-kubernetes: ${errorMessage(
        error,
      )}`,
    );
  }
}

async function assertJsonHealth(url: string, service: string) {
  let response: Response;

  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new Error(`${service} health check failed at ${url}: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${service} health check failed at ${url}: HTTP ${response.status}${body ? ` ${body}` : ''}`);
  }
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
  const target = ['--kubeconfig', kubeconfig, '--context', kubeContext, '-n', namespace];

  await execFile(
    'kubectl',
    [...target, 'wait', '--for=condition=Ready', `pod/workspace-${workspaceId}`, '--timeout=180s'],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const child = spawn(
    'kubectl',
    [...target, 'port-forward', `service/workspace-${workspaceId}`, `${agentLocalPort}:8080`],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

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

async function waitForTerminalMarker(
  events: AsyncIterable<{ type?: string; data?: unknown }>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const iterator = events[Symbol.asyncIterator]();

  let buffer = '';

  const hasMarker = () =>
    buffer.includes(']654;prompt') || buffer.includes(']654;interactive') || buffer.includes('ready');

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();

    let value: { type?: string; data?: unknown } | null | undefined;

    try {
      value = await Promise.race([
        iterator.next().then((r) => (r.done ? null : r.value)),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), remaining)),
      ]);
    } catch {
      return false;
    }

    if (value === null) {
      return hasMarker(); // stream closed
    }

    if (value === undefined) {
      break; // overall timeout
    }

    if (value.type === 'stdout') {
      buffer += String(value.data ?? '');
    }

    if (hasMarker()) {
      return true;
    }
  }

  return false;
}

async function consumeCommandStream(
  events: AsyncIterable<{ type?: string; data?: unknown; error?: unknown }>,
  onOutput: (data: string) => void,
) {
  for await (const event of events) {
    if ((event.type === 'stdout' || event.type === 'stderr') && event.data !== undefined) {
      onOutput(String(event.data));
    }

    if (event.type === 'error') {
      throw new Error(`streamed runtime command failed: ${errorMessage(event.error)}`);
    }
  }
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

async function waitForValue<T>(read: () => Promise<T | undefined>, timeoutMs: number, description: string): Promise<T> {
  const startedAt = Date.now();

  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await read();

      if (value !== undefined) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const suffix = lastError ? `: ${errorMessage(lastError)}` : '';
  throw new Error(`timed out waiting for ${description} after ${timeoutMs}ms${suffix}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

process.on('exit', () => {
  portForward?.kill();
});

main().catch((error) => {
  portForward?.kill();
  console.error(error);
  process.exit(1);
});
