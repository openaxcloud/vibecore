import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => []) }));
vi.mock('./entry-export-reconcile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./entry-export-reconcile')>()),
  applyEntryExportReconcile: reconcile,
}));

describe('direct payload receipts on an isolated real filesystem', () => {
  let directory: string;
  let runtime: RuntimeAdapter;
  let runner: ActionRunner;

  const data = (id = 'write'): ActionCallbackData => ({
    messageId: 'turn',
    artifactId: 'artifact',
    actionId: id,
    action: { type: 'file', filePath: `${id}.md`, content: 'observed\u0000 payload\n' },
  });
  const execute = async (action = data(), streaming = false) => {
    runner.addAction(action);
    await runner.runAction(action, streaming);
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'direct-receipt-'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Network forbidden in this fixture');
      }),
    );
    reconcile.mockReset();
    reconcile.mockResolvedValue([]);
    runtime = {
      workdir: directory,
      createDirectory: vi.fn(async (path: string) => {
        await mkdir(join(directory, path), { recursive: true });
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        await writeFile(join(directory, path), content);
      }),
      readFile: vi.fn(async (path: string) => ({ content: await readFile(join(directory, path), 'utf8') })),
    } as unknown as RuntimeAdapter;
    runner = new ActionRunner(runtime, () => ({}) as BoltShell);
  });

  afterEach(async () => {
    runner.abortAll();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it('confirms sanitized bytes once, without retaining content or rewriting', async () => {
    await execute();
    expect(await readFile(join(directory, 'write.md'), 'utf8')).toBe('observed payload\n');
    expect(runner.consumeConfirmedFileWrite('write')).toEqual({
      filePath: 'write.md',
      runtime,
      abortSignal: expect.any(AbortSignal),
    });
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
    expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  });

  it.each(['old bytes', 'concurrent edit'])('does not confirm a readback of %s or retry the write', async (content) => {
    vi.mocked(runtime.readFile).mockImplementation(async () => ({ content }) as any);
    await execute();
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
    expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  });

  it('keeps an unreadable write unknown without retrying the write', async () => {
    vi.mocked(runtime.readFile).mockRejectedValue(new Error('unreadable'));
    await execute();
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
    expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  });

  it('does not confirm emergency closure even when its bytes are readable', async () => {
    await execute({ ...data(), fermetureDeSecours: true });
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
  });

  it('does not confirm a rejected write', async () => {
    vi.mocked(runtime.writeFile).mockRejectedValue(Object.assign(new Error('rejected'), { code: 'EACCES' }));
    await execute();
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
    expect(runner.actions.get().write.status).toBe('failed');
  });

  it('does not promote streamed bytes', async () => {
    await execute(data(), true);
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
  });

  it('does not promote an identical streamed write when closing deduplication skips the final write', async () => {
    const action = data();
    await execute(action, true);
    await runner.runAction(action, false);

    expect(runtime.writeFile).toHaveBeenCalledTimes(1);
    expect(runtime.writeFile).toHaveBeenCalledWith('write.md', 'observed payload\n', { streaming: true });
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
  });

  it.each(['abort', 'rebind'])('discards observation if %s occurs during readback', async (change) => {
    const original = runtime.readFile.bind(runtime);
    vi.mocked(runtime.readFile).mockImplementation(async (...args) => {
      const result = await original(...args);

      if (change === 'abort') {
        runner.abortAll();
      } else {
        runner.setRuntime({ ...runtime });
      }

      return result;
    });
    await execute();
    expect(runner.consumeConfirmedFileWrite('write')).toBeUndefined();
  });

  it('observes before reconciliation and never counts its placeholder writes', async () => {
    reconcile.mockImplementationOnce(async () => {
      await runtime.writeFile('placeholder.md', 'waiting');
      await runtime.writeFile('write.md', 'reconciled');

      return [];
    });
    await execute();
    expect(runner.consumeConfirmedFileWrite('write')?.filePath).toBe('write.md');
    expect(runner.consumeConfirmedFileWrite('placeholder')).toBeUndefined();
    expect(await readFile(join(directory, 'write.md'), 'utf8')).toBe('reconciled');
  });

  it('bounds unconsumed metadata to 32 actions', async () => {
    for (let index = 0; index < 33; index++) {
      await execute(data(`write-${index}`));
    }
    expect(runner.consumeConfirmedFileWrite('write-0')).toBeUndefined();
    expect(runner.consumeConfirmedFileWrite('write-32')?.filePath).toBe('write-32.md');
  });
});
