import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['app', 'services', 'packages', 'infra'];
const blocked = /\b(Mock|mock|InMemory|stub|fake|scaffolded)\b|Test(ApiStore|ProjectStorage|GitProvider|EmailProvider|WorkspaceStore|EventBus|WorkspaceK8sClient)/;
const ignoredSegments = new Set(['node_modules', 'dist', 'build', '.vite', 'generated', '__snapshots__']);
const ignoredFiles = [/\.spec\./, /\.test\./, /vitest\.config\./, /\/tests\//, /\/src\/tests\//];

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredSegments.has(entry.name)) {
        yield* files(path);
      }
      continue;
    }

    if (entry.isFile()) {
      yield path;
    }
  }
}

const violations = [];

for (const root of roots) {
  if (!(await stat(root).catch(() => undefined))) {
    continue;
  }

  for await (const file of files(root)) {
    const normalized = file.replaceAll('\\', '/');

    if (!/\.(ts|tsx|js|jsx|json|yaml|yml|md)$/.test(normalized) || ignoredFiles.some((pattern) => pattern.test(normalized))) {
      continue;
    }

    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (blocked.test(line)) {
        violations.push(`${normalized}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error('Runtime mock/stub/scaffold markers are not allowed:');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('runtime mock scan clean');
