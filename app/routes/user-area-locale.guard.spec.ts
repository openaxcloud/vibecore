/**
 * @vitest-environment node
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routesDirectory = resolve(process.cwd(), 'app/routes');
const userAreaMarkers = /<(?:AppShell|EnterpriseFormPage|ProjectShell)\b/u;
const implicitLocaleCall = /\.toLocale(?:String|DateString|TimeString)\(\s*(?:\)|undefined\s*[,)]?)/u;

const helperFiles = [
  'app/components/ui/RepositoryStats.tsx',
  'app/lib/dashboard-projects.ts',
  'app/routes/projects.$projectId.env.helpers.ts',
  'app/routes/projects.$projectId.secrets.rows.ts',
];

describe('user-area locale consistency', () => {
  it('never relies on the browser or server default locale for rendered copy', () => {
    const routeFiles = readdirSync(routesDirectory)
      .filter((file) => /\.tsx?$/u.test(file) && !/\.spec\.tsx?$/u.test(file))
      .map((file) => resolve(routesDirectory, file))
      .filter((file) => userAreaMarkers.test(readFileSync(file, 'utf8')));

    const files = [...routeFiles, ...helperFiles.map((file) => resolve(process.cwd(), file))];

    const failures = files
      .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => implicitLocaleCall.test(source))
      .map(({ file }) => file.replace(`${process.cwd()}/`, ''));

    expect(failures).toEqual([]);
  });
});
