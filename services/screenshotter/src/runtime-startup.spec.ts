import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

const commands = ['cloudbuild.yaml', 'infra/cloudbuild/runtime-tier.yaml'].map((file) => {
  const config = parse(readFileSync(join(repositoryRoot, file), 'utf8'));
  const build = config.steps.find((step: { id: string }) => step.id === 'build-screenshotter');
  const argument = build.args.find((arg: string) => arg.startsWith('--build-arg=START_CMD='));

  return [file, argument.slice('--build-arg=START_CMD='.length)] as const;
});
commands.push(['package.json', manifest.scripts.start]);

describe('screenshotter production entrypoint', () => {
  let output: string;

  beforeAll(() => {
    output = mkdtempSync(join(packageRoot, '.runtime-smoke-'));

    for (const file of readdirSync(join(packageRoot, 'src'))) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) {
        continue;
      }

      const source = readFileSync(join(packageRoot, 'src', file), 'utf8');

      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      writeFileSync(join(output, file.replace(/\.ts$/, '.js')), compiled.outputText);
    }
  });

  afterAll(() => rmSync(output, { recursive: true, force: true }));

  it.each(commands)(
    '%s starts the real server with its source-only security dependency',
    async (_file, command) => {
      const [loader, entrypoint, ...extra] = command.split(' ');
      expect(entrypoint).toBe('dist/server.js');
      expect(extra).toEqual([]);
      expect(manifest.dependencies[loader === 'node' ? 'tsx' : loader]).toBeDefined();

      const executable = loader === 'node' ? process.execPath : join(packageRoot, 'node_modules/.bin', loader);

      const child = spawn(executable, [relative(packageRoot, join(output, 'server.js'))], {
        cwd: packageRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          SCREENSHOTTER_ALLOWED_HOSTS: 'example.com',
          SCREENSHOTTER_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const closed = new Promise<void>((resolveClosed) => child.once('close', () => resolveClosed()));

      try {
        const port = await new Promise<number>((resolvePort, reject) => {
          let stdout = '';
          let stderr = '';

          const timer = setTimeout(() => reject(new Error('Entrypoint did not become ready')), 10_000);
          child.stdout.on('data', (data) => {
            stdout += data.toString();

            const match = stdout.match(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/);

            if (match) {
              clearTimeout(timer);
              resolvePort(Number(match[1]));
            }
          });
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          child.once('error', () => {
            clearTimeout(timer);
            reject(new Error('Entrypoint could not be spawned'));
          });
          child.once('exit', (code) => {
            clearTimeout(timer);

            const moduleError = stderr.match(/ERR_[A-Z_]+/)?.[0] ?? 'NoModuleDiagnostic';
            reject(new Error(`Entrypoint exited ${code}: ${moduleError}`));
          });
        });

        const response = await fetch(`http://127.0.0.1:${port}/health`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
      } finally {
        child.kill('SIGTERM');
        await closed;
      }
    },
    15_000,
  );
});
