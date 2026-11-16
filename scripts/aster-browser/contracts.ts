import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type Identity = { projectId: string; workspaceId: string };
export type PodProof = { podUid: string; pvcUid: string; resourceVersion: string; hashes: Record<string, string> };
export type Request = Identity & { action: 'inspect' | 'replace-empty'; expected?: PodProof };
export type Receipt = Request & {
  requestId: string;
  runId: string;
  cluster: string;
  status: 'ok';
  pod?: PodProof;
  replaced?: {
    oldPvcUid: string;
    newPvcUid: string;
    emptyEntries: string[];
    stoppedPodUid: string;
    conditionalDelete: { uid: string; resourceVersion: string };
  };
};
export type Descriptor = { runId: string; cluster: string; origin: string; sourceSha: string };
export function validateProviderAbsent(env: Record<string, string | undefined>) {
  assert.equal(env.E2E_PROVIDER_MODE, 'absent');

  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY']) {
    assert.ok(!env[key], `Provider-absent E2E refuses configured credential: ${key}`);
  }
}

export const baseSha = '3f5ce0261a3b1fc97694f904555d6a6916922640';
export const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function validateDescriptor(value: Descriptor) {
  assert.equal(value.sourceSha, baseSha);
  assert.match(value.runId, /^[a-f0-9]{32}$/);
  assert.match(value.cluster, /^vc-private-[a-f0-9]{16}$/);

  const url = new URL(value.origin);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port);
  assert.equal(url.origin, value.origin);
}

export function validateReceipt(receipt: Receipt, request: Request, descriptor: Descriptor, requestId: string) {
  assert.equal(receipt.requestId, requestId);
  assert.equal(receipt.runId, descriptor.runId);
  assert.equal(receipt.cluster, descriptor.cluster);
  assert.equal(receipt.projectId, request.projectId);
  assert.equal(receipt.workspaceId, request.workspaceId);
  assert.equal(receipt.action, request.action);
  assert.equal(receipt.status, 'ok');

  if (request.action === 'replace-empty') {
    assert.ok(request.expected && receipt.replaced);
    assert.equal(receipt.replaced.oldPvcUid, request.expected.pvcUid);
    assert.equal(receipt.replaced.stoppedPodUid, request.expected.podUid);
    assert.deepEqual(receipt.replaced.conditionalDelete, {
      uid: request.expected.pvcUid,
      resourceVersion: request.expected.resourceVersion,
    });
    assert.ok(receipt.replaced.newPvcUid && receipt.replaced.newPvcUid !== receipt.replaced.oldPvcUid);
    assert.deepEqual(receipt.replaced.emptyEntries, []);
  } else {
    assert.ok(receipt.pod?.podUid && receipt.pod.pvcUid && receipt.pod.resourceVersion);
  }
}

/** File IPC only. No default receipt, shell hook, HTTP control endpoint or simulated host implementation. */
export async function openHost(directory: string) {
  const root = resolve(directory);
  const info = await lstat(root);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(info.mode & 0o077, 0, 'Orchestrator directory must be private (0700)');
  assert.equal(info.uid, process.getuid?.());

  const descriptor = JSON.parse(await readFile(join(root, 'descriptor.json'), 'utf8')) as Descriptor;
  validateDescriptor(descriptor);

  let sequence = 0;

  return {
    descriptor,
    async request(request: Request): Promise<Receipt> {
      const requestId = `${descriptor.runId}-${++sequence}`;
      await writeFile(
        join(root, `${requestId}.request.json`),
        JSON.stringify({ ...request, requestId, ...descriptor }),
        { flag: 'wx', mode: 0o600 },
      );

      const deadline = Date.now() + 180_000;
      const path = join(root, `${requestId}.receipt.json`);

      while (Date.now() < deadline) {
        try {
          const info = await lstat(path);
          assert.ok(info.isFile() && !info.isSymbolicLink());
          assert.equal(info.uid, process.getuid?.());
          assert.equal(info.mode & 0o077, 0);

          const receipt = JSON.parse(await readFile(path, 'utf8')) as Receipt;
          validateReceipt(receipt, request, descriptor, requestId);

          return receipt;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`HOST_ORCHESTRATOR_UNAVAILABLE: ${request.action}`);
    },
  };
}
