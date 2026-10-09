import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

it('l’installation de production réelle de l’admin retire le moteur de test', () => {
  const bac = mkdtempSync(join(tmpdir(), 'admin-production-'));
  const runtime = bac;

  try {
    /*
     * Isoler l'importeur admin conserve les versions verrouillées sans demander
     * les métadonnées réseau de projets sans rapport avec cette image.
     */
    const lockfile = parse(readFileSync('pnpm-lock.yaml', 'utf8'));
    lockfile.importers = { '.': lockfile.importers['apps/admin'] };
    writeFileSync(join(runtime, 'pnpm-lock.yaml'), stringify(lockfile));

    const manifeste = JSON.parse(readFileSync('apps/admin/package.json', 'utf8'));
    manifeste.pnpm = { overrides: lockfile.overrides };
    writeFileSync(join(runtime, 'package.json'), JSON.stringify(manifeste));
    execFileSync(
      'pnpm',
      ['install', '--dir', runtime, '--prod', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 90_000,
      },
    );
    execFileSync('node', ['scripts/elaguer-magasin-pnpm.mjs', runtime, '--supprimer'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 30_000,
    });

    const entrees = readdirSync(join(runtime, 'node_modules', '.pnpm'));

    expect(
      entrees.some((nom) => nom.startsWith('vite@')),
      'témoin positif : le magasin déployé existe',
    ).toBe(true);
    expect(entrees.filter((nom) => /^(?:vitest|@vitest\+[^@]+|tinypool)@/u.test(nom))).toEqual([]);
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
});
