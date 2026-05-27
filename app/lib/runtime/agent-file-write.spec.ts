import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeAcceptedAgentFile, type AgentFileWriteRuntime } from './agent-file-write';

function makeRuntime(): AgentFileWriteRuntime & {
  createDirectory: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
} {
  return {
    createDirectory: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  };
}

describe('writeAcceptedAgentFile', () => {
  let runtime: ReturnType<typeof makeRuntime>;

  beforeEach(() => {
    runtime = makeRuntime();
  });

  it('creates the parent directory then writes the file for a nested path', async () => {
    await writeAcceptedAgentFile(runtime, 'src/components/App.tsx', 'export default function App() {}');

    expect(runtime.createDirectory).toHaveBeenCalledWith('src/components');
    expect(runtime.writeFile).toHaveBeenCalledWith('src/components/App.tsx', 'export default function App() {}');
    expect(runtime.createDirectory.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.writeFile.mock.invocationCallOrder[0],
    );
  });

  it('skips createDirectory when the file lives at the project root', async () => {
    await writeAcceptedAgentFile(runtime, 'README.md', '# hi');

    expect(runtime.createDirectory).not.toHaveBeenCalled();
    expect(runtime.writeFile).toHaveBeenCalledWith('README.md', '# hi');
  });

  it('normalizes trailing slashes on the parent directory so the runtime call is canonical', async () => {
    /*
     * `path.dirname('src/deep/')` returns 'src/deep' on POSIX, but a caller
     * passing a synthetic Windows-style path or a stray double slash
     * shouldn't produce 'src/deep/' for createDirectory.
     */
    await writeAcceptedAgentFile(runtime, 'src/deep//file.ts', 'content');

    expect(runtime.createDirectory).toHaveBeenCalledWith('src/deep');
    expect(runtime.writeFile).toHaveBeenCalledWith('src/deep//file.ts', 'content');
  });

  it('sanitizes accepted content before writing because review-first mode bypasses the streaming write', async () => {
    const content = 'line one\n\u0000line two\n  indented\n';

    await writeAcceptedAgentFile(runtime, 'src/raw.txt', content);

    expect(runtime.writeFile).toHaveBeenCalledWith('src/raw.txt', 'line one\nline two\n  indented\n');
  });

  it('rejects invalid JSON before writing it to the runtime', async () => {
    await expect(writeAcceptedAgentFile(runtime, 'package.json', '{')).rejects.toThrow(
      'Refusing to write invalid JSON to package.json',
    );

    expect(runtime.writeFile).not.toHaveBeenCalled();
  });

  it('propagates a runtime.writeFile rejection so the caller can mark the proposal failed', async () => {
    runtime.writeFile.mockRejectedValueOnce(new Error('runtime offline'));

    await expect(writeAcceptedAgentFile(runtime, 'src/App.tsx', 'x')).rejects.toThrow('runtime offline');
  });
});
