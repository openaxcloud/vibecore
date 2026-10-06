import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * L'ÉLAGAGE DU MAGASIN pnpm EST CE QUI OUVRE LA PORTE DE VULNÉRABILITÉ.
 *
 * Mesuré le 2026-10-06, en sondant depuis le cluster les deux images que la
 * porte venait de refuser :
 *
 *     image   entrées .pnpm   atteignables   mortes
 *     web         1 554            154       1 400
 *     admin       1 461            164       1 297
 *
 * Les deux CVE CRITIQUES bloquantes étaient sur des entrées MORTES —
 * `@capacitor/android` 8.3.1 (web) et `tinypool` 1.1.1 (admin), zéro lien vers
 * elles. Ce garde tient les deux moitiés : que le script fasse ce qu'il dit, et
 * que les deux constructions l'appellent vraiment.
 */

const RACINE = process.cwd();
const SCRIPT = join(RACINE, 'scripts/elaguer-magasin-pnpm.mjs');

const bacs: string[] = [];

afterEach(() => {
  for (const bac of bacs.splice(0)) {
    rmSync(bac, { recursive: true, force: true });
  }
});

/** Un faux magasin : `vivantes` entrées liées depuis node_modules, `mortes` orphelines. */
function fabriquerMagasin(vivantes: number, mortes: number): string {
  const bac = mkdtempSync(join(tmpdir(), 'elagage-'));
  bacs.push(bac);

  const modules = join(bac, 'node_modules');
  const magasin = join(modules, '.pnpm');
  mkdirSync(magasin, { recursive: true });

  const poser = (nom: string, lier: boolean) => {
    const dossier = join(magasin, `${nom}@1.0.0`, 'node_modules', nom);
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, 'package.json'), JSON.stringify({ name: nom, version: '1.0.0' }));

    if (lier) {
      symlinkSync(join('.pnpm', `${nom}@1.0.0`, 'node_modules', nom), join(modules, nom));
    }
  };

  for (let i = 0; i < vivantes; i += 1) {
    poser(`vivant-${i}`, true);
  }

  for (let i = 0; i < mortes; i += 1) {
    poser(`mort-${i}`, false);
  }

  return bac;
}

function lancer(bac: string, ...args: string[]): { code: number; sortie: string } {
  try {
    const sortie = execFileSync('node', [SCRIPT, bac, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, sortie };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, sortie: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function entrees(bac: string): string[] {
  return readdirSync(join(bac, 'node_modules', '.pnpm')).filter((n) => n !== 'node_modules' && n !== 'lock.yaml');
}

describe('l’élagage du magasin pnpm', () => {
  it('supprime les entrées MORTES et laisse résoudre les vivantes', () => {
    const bac = fabriquerMagasin(3, 5);

    expect(entrees(bac), 'témoin : le banc porte bien 8 entrées').toHaveLength(8);

    const { code, sortie } = lancer(bac, '--supprimer', '--plancher=1');

    expect(code, `l’élagage a échoué :\n${sortie}`).toBe(0);
    expect(sortie).toMatch(/atteignables\s+: 3/u);
    expect(sortie).toMatch(/mortes\s+: 5/u);
    expect(entrees(bac), 'il ne doit rester que les trois atteignables').toHaveLength(3);

    /*
     * LA MOITIÉ QUI COMPTE : les liens survivants résolvent encore. Un élagage
     * qui casse la résolution ne se verrait qu'au démarrage du conteneur, très
     * loin de sa cause.
     */
    for (let i = 0; i < 3; i += 1) {
      const manifeste = JSON.parse(readFileSync(join(bac, 'node_modules', `vivant-${i}`, 'package.json'), 'utf8'));
      expect(manifeste.name, 'le lien vivant doit encore résoudre vers son paquet').toBe(`vivant-${i}`);
    }
  });

  it('REFUSE et ne supprime rien quand trop peu d’entrées sont atteignables', () => {
    /*
     * Le mode de panne redouté : un parcours de liens cassé rend zéro
     * atteignable, donc « tout est mort », donc une image vidée. Le plancher est
     * là pour ça, et il doit refuser AVANT d'effacer.
     */
    const bac = fabriquerMagasin(2, 9);

    const { code, sortie } = lancer(bac, '--supprimer');

    expect(code, 'un atteignable sous le plancher doit faire ÉCHOUER').toBe(1);
    expect(sortie).toMatch(/plancher/u);
    expect(entrees(bac), 'aucune entrée ne doit avoir été supprimée').toHaveLength(11);
  });

  it('ÉCHOUE si le magasin est introuvable, au lieu de réussir sans rien faire', () => {
    const bac = mkdtempSync(join(tmpdir(), 'elagage-vide-'));
    bacs.push(bac);

    const { code, sortie } = lancer(bac, '--supprimer', '--plancher=1');

    expect(code, 'un magasin absent doit faire échouer').toBe(1);
    expect(sortie).toMatch(/magasin introuvable/u);
  });

  it('ne supprime RIEN sans `--supprimer`', () => {
    const bac = fabriquerMagasin(3, 4);

    const { code, sortie } = lancer(bac, '--plancher=1');

    expect(code).toBe(0);
    expect(sortie).toMatch(/simulation/u);
    expect(entrees(bac), 'la simulation ne doit rien effacer').toHaveLength(7);
  });

  it('LES DEUX CONSTRUCTIONS L’APPELLENT — sinon le correctif ne protège aucune image', () => {
    const racine = readFileSync(join(RACINE, 'Dockerfile'), 'utf8');
    const service = readFileSync(join(RACINE, 'infra/docker/node-service.Dockerfile'), 'utf8');

    expect(
      racine,
      'le Dockerfile racine (image web) n’élague plus le magasin : `@capacitor/android` et ' +
        '1 400 entrées mortes reviendraient, et la porte de vulnérabilité refuserait de nouveau',
    ).toMatch(/elaguer-magasin-pnpm\.mjs \/app --supprimer/u);

    expect(
      service,
      'node-service.Dockerfile (images admin et services) n’élague plus : `tinypool` et ' +
        '1 297 entrées mortes reviendraient',
    ).toMatch(/elaguer-magasin-pnpm\.mjs \/runtime --supprimer/u);

    /*
     * Le contexte de cet étage est volontairement étroit (BUG-BUILD-002) : sans
     * ce COPY, le `RUN` ci-dessus échouerait sur « module not found » — un
     * échec franc, mais dont la cause est à deux lignes de là.
     */
    expect(
      service,
      'le script n’est plus copié dans l’étage de construction : le `RUN` ne pourrait pas le charger',
    ).toMatch(/COPY scripts\/elaguer-magasin-pnpm\.mjs/u);
  });

  it('l’élagage vient APRÈS la production des dépendances, jamais avant', () => {
    const racine = readFileSync(join(RACINE, 'Dockerfile'), 'utf8');
    const prune = racine.indexOf('pnpm prune --prod');
    const elagage = racine.indexOf('elaguer-magasin-pnpm.mjs /app');

    expect(prune, '`pnpm prune --prod` a disparu du Dockerfile racine').toBeGreaterThan(-1);
    expect(elagage, 'l’élagage a disparu du Dockerfile racine').toBeGreaterThan(-1);
    expect(elagage, 'élaguer avant `pnpm prune` laisserait pnpm recréer des liens vers des entrées effacées').toBeGreaterThan(
      prune,
    );

    const service = readFileSync(join(RACINE, 'infra/docker/node-service.Dockerfile'), 'utf8');
    const deploy = service.indexOf('pnpm deploy --filter');
    const elagageService = service.indexOf('elaguer-magasin-pnpm.mjs /runtime');

    expect(deploy, '`pnpm deploy` a disparu de node-service.Dockerfile').toBeGreaterThan(-1);
    expect(elagageService, 'élaguer avant `pnpm deploy` porterait sur un magasin que `deploy` va réécrire').toBeGreaterThan(
      deploy,
    );
  });
});
