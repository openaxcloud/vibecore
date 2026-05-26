import { describe, expect, it } from 'vitest';
import {
  hasInstalledPreviewDependencies,
  previewDependencyNames,
  type RuntimeDirectoryEntry,
} from './preview-dependencies';

function directoryLister(entries: Record<string, RuntimeDirectoryEntry[]>) {
  return async (directory: string) => {
    const result = entries[directory];

    if (!result) {
      throw new Error(`Missing directory: ${directory}`);
    }

    return result;
  };
}

describe('preview dependency helpers', () => {
  it('collects runtime dependencies from production, dev and optional manifests', () => {
    expect(
      previewDependencyNames({
        dependencies: { react: '^18.0.0' },
        devDependencies: { vite: '^5.0.0' },
        optionalDependencies: { sharp: '^0.33.0' },
      }),
    ).toEqual(['react', 'sharp', 'vite']);
  });

  it('requires declared packages to exist in node_modules before skipping install', async () => {
    await expect(
      hasInstalledPreviewDependencies(
        {
          dependencies: { react: '^18.0.0', 'react-router-dom': '^6.0.0' },
          devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^5.0.0' },
        },
        directoryLister({
          node_modules: [
            { name: '@vitejs', type: 'directory' },
            { name: 'react', type: 'directory' },
            { name: 'vite', type: 'directory' },
          ],
          'node_modules/@vitejs': [{ name: 'plugin-react', type: 'directory' }],
        }),
      ),
    ).resolves.toBe(false);
  });

  it('accepts scoped and unscoped dependencies when they are installed', async () => {
    await expect(
      hasInstalledPreviewDependencies(
        {
          dependencies: { react: '^18.0.0', 'react-router-dom': '^6.0.0' },
          devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^5.0.0' },
        },
        directoryLister({
          node_modules: [
            { name: '@vitejs', type: 'directory' },
            { name: 'react', type: 'directory' },
            { name: 'react-router-dom', type: 'directory' },
            { name: 'vite', type: 'directory' },
          ],
          'node_modules/@vitejs': [{ name: 'plugin-react', type: 'directory' }],
        }),
      ),
    ).resolves.toBe(true);
  });
});
