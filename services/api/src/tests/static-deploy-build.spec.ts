import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runStaticBuild } from '../deployments.js';

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;
const previousHome = process.env.HOME;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }

  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
});

describe('runStaticBuild', () => {
  it('uses an isolated writable HOME/cache so npm install works when server HOME is invalid', async () => {
    const storage = await mkdtemp(join(tmpdir(), 'vc-static-build-storage-'));
    const projectId = 'project-home-sandbox';
    const projectDir = join(storage, projectId);

    process.env.PROJECT_STORAGE_DIR = storage;
    process.env.HOME = '/home/node/does-not-exist-for-test';

    try {
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({
          scripts: {
            build: 'node build.mjs',
          },
        }),
        'utf8',
      );

      await writeFile(
        join(projectDir, 'build.mjs'),
        [
          "import { mkdir, writeFile } from 'node:fs/promises';",
          "import { join } from 'node:path';",
          "await mkdir('dist', { recursive: true });",
          "await writeFile(join('dist', 'index.html'), '<!doctype html><h1>Deploy</h1>');",
          "await writeFile('build-home.txt', process.env.HOME ?? '');",
        ].join('\n'),
        'utf8',
      );

      const result = await runStaticBuild({
        projectId,
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        envVars: {},
        timeoutSeconds: 60,
        artifactSizeLimitMb: 5,
      });

      expect(result.ok).toBe(true);
      expect(result.outputDir).toBe(join(projectDir, 'dist'));

      const buildHome = await readFile(join(projectDir, 'build-home.txt'), 'utf8');
      expect(buildHome).toBe(join(projectDir, '.vibecore-deploy-home'));
      expect(JSON.stringify(result.logs)).toContain('using isolated build home');
      expect(JSON.stringify(result.logs)).toContain('npm install --include=dev --no-audit --no-fund');
    } finally {
      await rm(storage, { recursive: true, force: true });
    }
  }, 120_000);
});
