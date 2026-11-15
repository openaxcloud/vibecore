import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { requireMaterializedPreviewManifest } from './preview-manifest-materialization';

describe('preview runtime manifest preflight', () => {
  it.each([404, 401, 503])('surfaces read failure %s and performs no command', async (status) => {
    const cause = { status };
    const command = vi.fn();
    await expect(
      (async () => {
        await requireMaterializedPreviewManifest(async () => {
          throw cause;
        }, 'localized guidance');
        command();
      })(),
    ).rejects.toMatchObject({ message: 'localized guidance', code: 'PREVIEW_MANIFEST_UNVERIFIED', cause });
    expect(command).not.toHaveBeenCalled();
  });

  it.each(['{}', '', '{unfinished'])('leaves readable content %j to existing Project Doctor', async (content) => {
    await expect(requireMaterializedPreviewManifest(async () => ({ content }), 'guidance')).resolves.toBeUndefined();
  });

  it('permits an explicit retry after external synchronization', async () => {
    let ready = false;

    const read = async () => {
      if (!ready) {
        throw { status: 404 };
      }

      return { content: '{}' };
    };
    await expect(requireMaterializedPreviewManifest(read, 'guidance')).rejects.toHaveProperty(
      'code',
      'PREVIEW_MANIFEST_UNVERIFIED',
    );
    ready = true;
    await expect(requireMaterializedPreviewManifest(read, 'guidance')).resolves.toBeUndefined();
  });

  it('does not reinstate the pre-Doctor guard or move existing healthy reattach paths', () => {
    const source = readFileSync(new URL('./workbench.ts', import.meta.url), 'utf8');
    const start = source.indexOf('  async #runStartPreviewServer(');
    const end = source.indexOf('  async #ensureWorkspaceProvisioned(', start);
    const run = source.slice(start, end);
    const first = run.indexOf('await this.#requireMaterializedPreviewManifest();');
    expect(first).toBeGreaterThan(run.indexOf('await this.#syncPreviewManifestFromRuntime()'));
    expect(first).toBeGreaterThan(run.indexOf('await this.loadRuntimeFiles'));
    expect(first).toBeLessThan(run.indexOf('await this.#stopPreviewProcesses(epoch)'));
    expect(first).toBeGreaterThan(run.indexOf('workbenchRuntime.preview.reattached'));

    const last = run.indexOf('await this.#requireMaterializedPreviewManifest(command, previewNeedsManifest)');
    expect(last).toBeGreaterThan(run.indexOf('await this.#detectPreviewCommand('));
    expect(last).toBeLessThan(run.indexOf('this.toggleTerminal(true)'));
    expect(run.slice(last)).toMatch(
      /await this\.#requireMaterializedPreviewManifest\(command, previewNeedsManifest\);\s*this\.#assertPreviewRunCurrent\(epoch\)/,
    );
  });
});
