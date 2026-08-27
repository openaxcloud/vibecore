import { spawn, type ChildProcess } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import {
  listGalleryDemoApps,
  materializeGalleryDemoApp,
  type GalleryDemoAppDefinition,
} from '../packages/template-catalog/src/server.js';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const validationRoot = path.join(rootDirectory, '.vibecore-audit', 'gallery-demo-app-validation');
const thumbnailRoot = path.join(rootDirectory, 'public', 'gallery-apps');
const evidenceRoot = process.env.GALLERY_EVIDENCE_DIR
  ? path.resolve(process.env.GALLERY_EVIDENCE_DIR)
  : path.join(rootDirectory, 'docs', 'ui-ux-evidence', '2026-07-16', 'community-gallery', 'runtime');
const selectedApp = process.argv.find((argument) => argument.startsWith('--app='))?.split('=')[1];
const skipInstall = process.argv.includes('--skip-install');
const skipBuild = process.argv.includes('--skip-build');
const portArgument = process.argv.find((argument) => argument.startsWith('--port='))?.split('=')[1];
const defaultPort = portArgument ? Number.parseInt(portArgument, 10) : 43_100;

function sanitizeEvidenceLog(value: string): string {
  return value
    .replaceAll(rootDirectory, '<workspace>')
    .replace(/^\s*➜\s+Network:\s+http:\/\/[^\n]+$/gmu, '  ➜  Network: <redacted local address>');
}

interface ValidationResult {
  id: string;
  contentHash: string;
  fileCount: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  install: 'passed' | 'skipped' | 'not-required';
  typecheck: 'passed' | 'not-defined';
  build: 'passed' | 'skipped' | 'not-defined';
  previewCommand: string;
  previewUrl: string;
  httpStatus: number;
  domMarker: string;
  pageErrors: string[];
  browserVersion: string;
  thumbnailPath: string;
  textLength: number;
  visualElements: number;
  installLogTail: string;
  buildLogTail: string;
  previewLogTail: string;
}

async function main() {
  const apps = listGalleryDemoApps().filter(
    (app) => !selectedApp || app.id === selectedApp || app.slug === selectedApp,
  );

  if (apps.length === 0) {
    throw new Error(`Unknown Gallery demo app: ${selectedApp}`);
  }

  await mkdir(validationRoot, { recursive: true });
  await mkdir(thumbnailRoot, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });

  const results: ValidationResult[] = [];

  for (const [index, app] of apps.entries()) {
    const port = defaultPort + index;
    process.stdout.write(`\n[gallery] ${app.id} (${index + 1}/${apps.length})\n`);
    results.push(await validateGalleryApp(app, port));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    packageManager: 'pnpm@9.14.4',
    browser: {
      engine: 'chromium',
      version: results[0]?.browserVersion,
      launchMode: 'isolated single-process browser per published demo app',
    },
    results,
  };

  const reportPath = path.join(
    evidenceRoot,
    selectedApp ? `gallery-demo-app-validation-${selectedApp}.json` : 'gallery-demo-app-validation.json',
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n[gallery] ${results.length}/${apps.length} passed\n[gallery] report ${reportPath}\n`);
}

async function validateGalleryApp(app: GalleryDemoAppDefinition, port: number) {
  const snapshot = materializeGalleryDemoApp(app.id);

  if (!snapshot) {
    throw new Error(`Could not materialize ${app.id}`);
  }

  const appDirectory = path.join(validationRoot, app.id);
  await rm(appDirectory, { force: true, recursive: true });
  await mkdir(appDirectory, { recursive: true });

  for (const [filePath, content] of Object.entries(snapshot.files)) {
    const absolutePath = safeGalleryAppPath(appDirectory, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
  }

  const packageJson = await readPackageJson(appDirectory);
  let install: ValidationResult['install'] = 'not-required';
  let typecheck: ValidationResult['typecheck'] = 'not-defined';
  let build: ValidationResult['build'] = 'not-defined';
  let installLogTail = '';
  let buildLogTail = '';

  if (packageJson) {
    if (skipInstall) {
      install = 'skipped';
    } else {
      installLogTail = await runCommand(
        'pnpm',
        ['install', '--ignore-workspace', '--no-frozen-lockfile'],
        appDirectory,
        12 * 60_000,
      );
      install = 'passed';
    }

    if (packageJson.scripts?.typecheck) {
      await runCommand('pnpm', ['run', 'typecheck'], appDirectory, 6 * 60_000);
      typecheck = 'passed';
    }

    if (packageJson.scripts?.build) {
      if (skipBuild) {
        build = 'skipped';
      } else {
        buildLogTail = await runCommand('pnpm', ['run', 'build'], appDirectory, 10 * 60_000, {
          GALLERY_PREVIEW_BASE: `/gallery-apps/${app.id}/preview/`,
        });
        build = 'passed';
      }
    }
  }

  await publishStaticPreview(app, appDirectory);

  const previewScript = selectPreviewScript(packageJson?.scripts, build === 'passed');
  const preview = await startPreview(app, appDirectory, port, previewScript);

  try {
    const previewPath = app.id === 'next-dashboard' ? `/gallery-apps/${app.id}/preview/` : '/';
    const previewUrl = `http://127.0.0.1:${port}${previewPath}`;
    const httpStatus = await waitForHttp(previewUrl, preview, 180_000);
    const browser = await launchAuditBrowser();
    const browserVersion = browser.version();

    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });

      try {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 180_000 });
        await page.locator(`[data-gallery-app-id="${app.id}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });

        const probe = await previewProbe(page);

        if (probe.childCount === 0 || probe.area < 40_000 || (probe.textLength < 10 && probe.visualElements === 0)) {
          throw new Error(`${app.id} rendered a blank preview: ${JSON.stringify(probe)}`);
        }

        if (pageErrors.length > 0) {
          throw new Error(`${app.id} raised browser errors: ${pageErrors.join(' | ')}`);
        }

        const thumbnailDirectory = path.join(thumbnailRoot, app.id);
        const thumbnailPath = path.join(thumbnailDirectory, 'thumbnail.png');
        await mkdir(thumbnailDirectory, { recursive: true });
        await page.screenshot({ path: thumbnailPath, animations: 'disabled', fullPage: false });

        return {
          id: app.id,
          contentHash: snapshot.contentHash,
          fileCount: snapshot.manifest.fileCount,
          dependencies: packageJson?.dependencies ?? {},
          devDependencies: packageJson?.devDependencies ?? {},
          install,
          typecheck,
          build,
          previewCommand: previewScript ? `pnpm run ${previewScript.name}` : 'node .ecode-validation-server.mjs',
          previewUrl,
          httpStatus,
          domMarker: `[data-gallery-app-id="${app.id}"]`,
          pageErrors: [],
          browserVersion,
          thumbnailPath: path.relative(rootDirectory, thumbnailPath),
          textLength: probe.textLength,
          visualElements: probe.visualElements,
          installLogTail: sanitizeEvidenceLog(installLogTail.slice(-4_000)),
          buildLogTail: sanitizeEvidenceLog(buildLogTail.slice(-4_000)),
          previewLogTail: sanitizeEvidenceLog(preview.validationLogs.join('').slice(-4_000)),
        } satisfies ValidationResult;
      } finally {
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(preview);
  }
}

async function publishStaticPreview(app: GalleryDemoAppDefinition, appDirectory: string) {
  const candidates = ['dist', 'out', 'public'];
  let sourceDirectory: string | undefined;

  for (const candidate of candidates) {
    const directory = path.join(appDirectory, candidate);
    try {
      await access(path.join(directory, 'index.html'));
      sourceDirectory = directory;
      break;
    } catch {
      // Try the next build convention.
    }
  }

  if (!sourceDirectory) {
    throw new Error(`${app.id} did not produce a static Gallery Preview artifact`);
  }

  const previewDirectory = path.join(thumbnailRoot, app.id, 'preview');
  await rm(previewDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(previewDirectory), { recursive: true });
  await cp(sourceDirectory, previewDirectory, { recursive: true });
}

async function launchAuditBrowser(): Promise<Browser> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // Isolating each proof in a short-lived single process prevents unrelated
      // Playwright workers from exhausting macOS Mach services during the matrix.
      return await chromium.launch({
        args: ['--disable-gpu', '--no-zygote', '--single-process'],
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }

  throw lastError;
}

function safeGalleryAppPath(appDirectory: string, filePath: string) {
  const absolutePath = path.resolve(appDirectory, filePath);
  const prefix = `${path.resolve(appDirectory)}${path.sep}`;

  if (!absolutePath.startsWith(prefix)) {
    throw new Error(`Gallery app path escapes its root: ${filePath}`);
  }

  return absolutePath;
}

async function readPackageJson(appDirectory: string) {
  try {
    return JSON.parse(await readFile(path.join(appDirectory, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

async function startPreview(
  app: GalleryDemoAppDefinition,
  appDirectory: string,
  port: number,
  previewScript?: { name: 'dev' | 'start'; command: string },
) {
  if (previewScript) {
    const extraArguments = previewArguments(previewScript.command, port);

    return spawnLogged('pnpm', ['run', previewScript.name, ...extraArguments], appDirectory, {
      HOST: '0.0.0.0',
      PORT: String(port),
      NITRO_HOST: '0.0.0.0',
      NITRO_PORT: String(port),
      NUXT_HOST: '0.0.0.0',
      NUXT_PORT: String(port),
      GALLERY_PREVIEW_BASE: app.id === 'next-dashboard' ? `/gallery-apps/${app.id}/preview` : '',
    });
  }

  if (app.runtime !== 'static') {
    throw new Error(`${app.id} has no dev script or static runtime`);
  }

  const serverPath = path.join(appDirectory, '.ecode-validation-server.mjs');
  await writeFile(
    serverPath,
    [
      "import { createReadStream } from 'node:fs';",
      "import { createServer } from 'node:http';",
      "import { extname, join, normalize } from 'node:path';",
      `const root = ${JSON.stringify(appDirectory)};`,
      `const port = ${port};`,
      "const types = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };",
      'createServer((request, response) => {',
      "  const pathname = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)).replace(/^[/\\\\]+/, '');",
      "  const target = join(root, pathname || 'index.html');",
      "  if (!target.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }",
      "  response.setHeader('content-type', types[extname(target)] ?? 'application/octet-stream');",
      '  const stream = createReadStream(target);',
      "  stream.on('error', () => response.writeHead(404).end('Not found'));",
      '  stream.pipe(response);',
      "}).listen(port, '0.0.0.0');",
    ].join('\n'),
    'utf8',
  );

  return spawnLogged(process.execPath, [serverPath], appDirectory);
}

function selectPreviewScript(scripts: Record<string, string> | undefined, buildPassed: boolean) {
  if (buildPassed && scripts?.start) {
    return { name: 'start' as const, command: scripts.start };
  }

  if (scripts?.dev) {
    return { name: 'dev' as const, command: scripts.dev };
  }

  return undefined;
}

function previewArguments(devScript: string, port: number) {
  if (/\bnext\s+(?:dev|start)\b/u.test(devScript)) {
    return ['--port', String(port)];
  }

  if (/\bnuxt\b/u.test(devScript)) {
    if (/\bnuxt\s+preview\b/u.test(devScript)) {
      return [];
    }

    return ['--port', String(port)];
  }

  if (/\bvite\b/u.test(devScript)) {
    return ['--port', String(port), '--strictPort'];
  }

  return [];
}

function spawnLogged(command: string, args: string[], cwd: string, environment: Record<string, string> = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...environment, CI: '1', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: string[] = [];
  const collect = (chunk: Buffer) => {
    logs.push(chunk.toString('utf8'));

    if (logs.length > 200) {
      logs.splice(0, logs.length - 200);
    }
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  Object.assign(child, { validationLogs: logs });

  return child as ChildProcess & { validationLogs: string[] };
}

async function waitForHttp(url: string, child: ChildProcess & { validationLogs?: string[] }, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Preview did not answer.';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Preview exited with ${child.exitCode}: ${(child.validationLogs ?? []).join('').slice(-8_000)}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });

      if (response.ok) {
        const status = response.status;
        await response.body?.cancel();
        return status;
      }

      lastError = `HTTP ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`${lastError}\n${(child.validationLogs ?? []).join('').slice(-8_000)}`);
}

async function previewProbe(page: Page) {
  return page.locator('body').evaluate((body) => {
    const rect = body.getBoundingClientRect();

    return {
      area: rect.width * Math.max(rect.height, body.scrollHeight),
      childCount: body.children.length,
      textLength: body.textContent?.replace(/\s+/g, ' ').trim().length ?? 0,
      visualElements: body.querySelectorAll('canvas, img, svg, video').length,
    };
  });
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  environment: Record<string, string> = {},
) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      env: { ...process.env, ...environment, CI: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    const collect = (chunk: Buffer) => {
      chunks.push(chunk);

      if (chunks.reduce((total, value) => total + value.byteLength, 0) > 2_000_000) {
        chunks.shift();
      }
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      void stopProcess(child);
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf8'));
        return;
      }

      const output = Buffer.concat(chunks).toString('utf8').slice(-12_000);
      reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})\n${output}`));
    });
  });
}

async function stopProcess(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    child.kill('SIGTERM');
  }

  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL');
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch {
      child.kill('SIGKILL');
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
