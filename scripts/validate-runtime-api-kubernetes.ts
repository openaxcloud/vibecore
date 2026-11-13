import { spawn, type ChildProcess } from 'node:child_process';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { RemoteKubernetesRuntimeAdapter } from '@vibecore/runtime-remote';
import {
  assertRecipeKubeconfig,
  privatePreviewUrl,
  verifyPrivatePreview,
  verifyRuntimeSnapshotRefused,
} from './private-runtime-recipe/checks.js';
import { podEvidence, type EvidencePod } from './private-runtime-recipe/evidence.js';

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
const privateRecipe = process.env.RUNTIME_API_E2E_PRIVATE_RECIPE === '1';
const password = process.env.RUNTIME_API_E2E_PASSWORD ?? 'RuntimeApiE2E!12345';

let portForward: ChildProcess | undefined;
let phase = 'preflight';

function checkpoint(next: string) {
  phase = next;
  console.log(JSON.stringify({ phase, status: 'started' }));
}

async function main() {
  await preflight();

  checkpoint('private-registration');

  const runId = Date.now();

  const auth = await registerUser({
    email: `runtime-api-e2e-${runId}@vibecore.local`,
    password,
    name: 'Runtime API E2E',
    organizationName: `Runtime API E2E ${runId}`,
  });
  checkpoint('project-create');

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

  checkpoint('real-workspace-provision');
  await adapter.boot();

  const session = await adapter.startWorkspace({
    id: project.project.id,
    metadata: { projectId: project.project.id, validation: 'runtime-api-kubernetes' },
  });
  assert(session.status === 'running', `workspace did not start: ${JSON.stringify(session)}`);

  portForward = await startPortForward(session.id);

  checkpoint('runtime-files-and-command');
  await adapter.writeFile('src/index.js', 'console.log("runtime-api-kubernetes")\n');

  const { content } = await adapter.readFile('src/index.js');
  assert(content.includes('runtime-api-kubernetes'), 'readFile did not return content written through the API runtime');

  await adapter.createFile('recipe-readme.md', '# Runtime API Kubernetes\n');

  const files = await adapter.listFiles();
  assert(files.length > 0, 'listFiles returned no files');

  const matches = await adapter.searchFiles('Runtime API Kubernetes');
  assert(
    matches.some((match) => match.path === 'recipe-readme.md'),
    'searchFiles did not find README.md content',
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

  checkpoint('terminal-websocket');

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

  const ports = await adapter.listPorts();
  assert(Array.isArray(ports), 'listPorts did not return an array');

  // Port 8080 is the agent itself, not a user app. Serve a controlled app on 4173.
  checkpoint('private-preview-http');

  const marker = `private-runtime-${randomUUID()}`;
  const serverCode = `require('node:http').createServer((_req,res)=>{res.setHeader('content-type','text/plain');res.end(${JSON.stringify(marker)})}).listen(4173,'0.0.0.0')`;
  await api(`/api/runtime/workspaces/${session.id}/commands`, auth.token, {
    method: 'POST',
    body: JSON.stringify({ command: 'node', args: ['-e', serverCode], background: true, operationId: randomUUID() }),
  });

  // Poll the proxy directly: /preview/:port meters opens and must only be called once.
  const proxyUrl = privatePreviewUrl(`/api/runtime/workspaces/${session.id}/preview/4173/proxy/`, apiBaseUrl);
  await eventually(async () => {
    const response = await fetch(proxyUrl, {
      headers: { authorization: `Bearer ${auth.token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    return response.status === 200 && (await response.text()).includes(marker);
  }, 'test app did not serve its marker');

  const preview = await adapter.getPreviewUrl(4173);
  assert(preview.ready, 'getPreviewUrl did not confirm the live test app');

  const foreign = await registerUser({
    email: `foreign-${runId}@vibecore.local`,
    password,
    name: 'Foreign recipe user',
    organizationName: `Foreign ${runId}`,
  });
  await verifyPrivatePreview(privatePreviewUrl(preview.url, apiBaseUrl), auth.token, foreign.token, marker);

  checkpoint('runtime-snapshot-refusal');
  await verifyRuntimeSnapshotRefused(() => adapter.createSnapshot('must-refuse-inventory'));

  /*
   * writeFile acknowledges durable project manifest persistence. A shell-only file
   * or applyPatch is NOT assumed to have entered that manifest/archive.
   */
  checkpoint('project-archive-capture');

  const proofPath = 'recipe-proof.txt';
  const savedBytes = `archive bytes ${randomUUID()}\n`;
  const changedBytes = `modified after archive ${randomUUID()}\n`;
  await adapter.writeFile(proofPath, savedBytes);
  assert((await adapter.readFile(proofPath)).content === savedBytes, 'pod did not receive the archive proof bytes');

  const { snapshot } = await api<{
    snapshot: {
      id: string;
      storageKey: string;
      byteLength: number;
      manifest: { files: { path: string; sizeBytes: number }[] };
    };
  }>(`/projects/${project.project.id}/snapshots`, auth.token, {
    method: 'POST',
    body: JSON.stringify({ label: 'Private runtime recipe', kind: 'manual' }),
  });
  assert(snapshot.storageKey && snapshot.byteLength > 0, 'project snapshot has no recoverable archive');
  assert(
    snapshot.manifest.files.some((file) => file.path === proofPath && file.sizeBytes === Buffer.byteLength(savedBytes)),
    'runtime-written bytes absent from project snapshot manifest',
  );

  checkpoint('postgres-archive-byte-readback');

  if (privateRecipe) {
    // Read/decode the actual PostgreSQL archive, not just its metadata. No secrets printed.
    const readback = await execFile(
      'kubectl',
      [
        '-n',
        namespace,
        'exec',
        'deployment/api',
        '--',
        'node_modules/.bin/tsx',
        'scripts/private-runtime-recipe/archive-readback.ts',
        project.project.id,
        snapshot.id,
        proofPath,
        createHash('sha256').update(savedBytes).digest('hex'),
      ],
      { timeout: 30_000 },
    );

    const archiveEvidence = JSON.parse(readback.stdout.trim()) as {
      check: string;
      archiveHash: string;
      fileHash: string;
      byteLength: number;
    };
    console.log(JSON.stringify(archiveEvidence));
  }

  checkpoint('pvc-persistence-after-pod-replacement');
  await adapter.writeFile(proofPath, changedBytes);
  assert((await adapter.readFile(proofPath)).content === changedBytes, 'mutation before restore did not reach pod');

  const before = await podIdentity(session.id);
  portForward?.kill();
  portForward = undefined;
  await adapter.stopWorkspace();
  await execFile(
    'kubectl',
    ['-n', namespace, 'wait', '--for=delete', `pod/workspace-${session.id}`, '--timeout=120s'],
    { timeout: 130_000 },
  );

  const reopened = await adapter.startWorkspace({
    id: project.project.id,
    metadata: { projectId: project.project.id },
  });
  assert(reopened.status === 'running' && reopened.id === session.id, 'reopen changed workspace identity');

  const after = await podIdentity(session.id);
  assert(
    before.uid !== after.uid && before.claim === after.claim && before.pvcUid === after.pvcUid,
    'pod was not replaced with the same PVC',
  );
  portForward = await startPortForward(session.id);
  assert(
    (await adapter.readFile(proofPath)).content === changedBytes,
    'saved mutation did not survive pod replacement',
  );

  // An unpersisted marker proves the PVC survived independently of manifest reseeding.
  assert(
    (await adapter.readFile('src/patched.txt')).content === 'patched via real API runtime\n',
    'PVC-only patch did not survive replacement',
  );

  checkpoint('project-archive-restore-into-pod');
  await api(`/projects/${project.project.id}/snapshots/${snapshot.id}/restore`, auth.token, {
    method: 'POST',
    body: '{}',
  });

  // Restore's pod sync is best-effort: HTTP 200 alone is NOT success.
  await eventually(
    async () => (await adapter.readFile(proofPath)).content === savedBytes,
    'project archive restore did not restore the actual pod bytes',
  );

  checkpoint('zip-export-import');

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
        scope: 'functional recipe; no AI generation, deployment, gVisor or network-isolation proof',
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
          'private preview HTTP content / anonymous and foreign-organization denial',
          'runtime snapshot rejected with 503 SNAPSHOT_ARCHIVE_UNAVAILABLE',
          'project archive manifest / restored pod bytes',
          ...(privateRecipe ? ['PostgreSQL ZIP archive checksum and file bytes'] : []),
          'new pod UID / same PVC UID / persistent bytes',
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
  if (privateRecipe) {
    assert(process.env.KUBECONFIG, 'Private recipe requires its isolated KUBECONFIG');

    const result = await execFile('kubectl', ['config', 'view', '--raw', '-o', 'json']);
    assertRecipeKubeconfig(JSON.parse(result.stdout), process.env.PRIVATE_RUNTIME_RECIPE_ID ?? '');

    for (const target of [apiBaseUrl, runtimeBaseUrl, workspaceManagerBaseUrl]) {
      assert(new URL(target).hostname === '127.0.0.1', 'Private recipe only accepts loopback service forwards');
    }
    assert(namespace === process.env.PRIVATE_RUNTIME_RECIPE_ID, 'Private recipe namespace mismatch');
  }

  await assertJsonHealth(`${apiBaseUrl}/health`, 'API');
  await assertJsonHealth(`${workspaceManagerBaseUrl}/health`, 'workspace-manager');

  try {
    await execFile('kubectl', ['version', '--client=true'], { maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`kubectl client is required for runtime API Kubernetes validation: ${errorMessage(error)}`);
  }

  try {
    await execFile('kubectl', ['-n', namespace, 'get', 'namespace', namespace], { maxBuffer: 2 * 1024 * 1024 });
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
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`${service} health check failed at ${url}: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${service} health check failed at ${url}: HTTP ${response.status}${body ? ` ${body}` : ''}`);
  }

  const health = (await response.json()) as { status?: string };
  assert(health.status === 'ok', `${service} health did not confirm status ok`);
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

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(120_000),
  });

  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${payload}`);
  }

  return (payload ? JSON.parse(payload) : undefined) as T;
}

async function startPortForward(workspaceId: string) {
  await execFile(
    'kubectl',
    ['-n', namespace, 'wait', '--for=condition=Ready', `pod/workspace-${workspaceId}`, '--timeout=180s'],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const child = spawn(
    'kubectl',
    ['-n', namespace, 'port-forward', `service/workspace-${workspaceId}`, `${agentLocalPort}:8080`],
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

async function podIdentity(workspaceId: string) {
  const { stdout } = await execFile('kubectl', ['-n', namespace, 'get', `pod/workspace-${workspaceId}`, '-o', 'json'], {
    timeout: 15_000,
  });
  const pod = JSON.parse(stdout) as {
    metadata: { uid: string };
    spec: { volumes: { name: string; persistentVolumeClaim?: { claimName: string } }[] };
  };

  if (privateRecipe) {
    const evidence = podEvidence(JSON.parse(stdout) as EvidencePod);
    const expectedImageID = process.env.PRIVATE_RUNTIME_EXPECTED_AGENT_IMAGE_ID;

    if (expectedImageID) {
      assert(
        evidence.containers.some(
          (container) => container.name === 'workspace-agent' && container.imageID === expectedImageID,
        ),
        'Workspace did not execute the exact inspected production agent image',
      );
    }

    console.log(JSON.stringify({ workspacePod: evidence }));
  }

  const claim = pod.spec.volumes.find((volume) => volume.persistentVolumeClaim)?.persistentVolumeClaim?.claimName;
  assert(claim && pod.metadata.uid, 'Workspace is missing its PVC or pod UID');

  const pvc = await execFile('kubectl', ['-n', namespace, 'get', `pvc/${claim}`, '-o', 'json'], { timeout: 15_000 });

  return {
    uid: pod.metadata.uid,
    claim,
    pvcUid: (JSON.parse(pvc.stdout) as { metadata: { uid: string } }).metadata.uid,
  };
}

async function eventually(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(message);
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
  console.log(
    JSON.stringify({
      ok: false,
      phase,
      failureCode: typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'VALIDATION_FAILED',
    }),
  );
  portForward?.kill();
  console.error(error);
  process.exit(1);
});
