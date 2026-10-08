import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * L'ÉLAGAGE DU MAGASIN pnpm EST CE QUI OUVRE LA PORTE DE VULNÉRABILITÉ.
 *
 * ⚠️ LES CHIFFRES DU 2026-10-06 ÉTAIENT FAUX, et d'un facteur neuf. Ils
 * annonçaient « 154 atteignables sur 1 554 », soit neuf entrées sur dix mortes.
 * La marche des liens s'arrêtait au premier niveau : elle descendait dans
 * `<paquet>/node_modules`, qui n'existe pas chez pnpm, au lieu de
 * `.pnpm/<entrée>/node_modules`, où les dépendances sont posées en VOISINES.
 *
 * Remesuré le 2026-10-07 avec la marche réparée, dans la MÊME image servie :
 *
 *     image   entrées .pnpm   atteignables   mortes
 *     web         1 554          1 398         156
 *     admin       1 461          1 312         149
 *
 * Les proportions sont INVERSÉES : neuf sur dix sont vivantes. La version fausse
 * a tué le crochet pre-upgrade `prisma-migrate` sur
 * `Cannot find module '@prisma/engines'` — une voisine supprimée — et Helm a
 * reverti tout seul (`--atomic`).
 *
 * Ce qui RESTE vrai : `@capacitor/android` 8.3.1 est bien MORT dans l'image web,
 * vérifié dans la liste des 156. Ce qui est devenu FAUX : `tinypool` 1.1.1 est
 * ATTEIGNABLE dans l'image admin, via `vitest@3.2.6` qui y est présent. Cette CVE
 * ne se ferme donc pas par l'élagage — elle se ferme en sortant `vitest` de
 * l'image de production.
 *
 * Ce garde tient les deux moitiés : que le script fasse ce qu'il dit, et que les
 * deux constructions l'appellent vraiment.
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

/**
 * Un faux magasin à la FORME DE pnpm : une entrée dont la dépendance n'est
 * atteignable que comme VOISINE, et dont le seul lien d'entrée est un FICHIER
 * dans `.bin` — exactement la forme de `prisma` → `@prisma/engines` qui a tué le
 * crochet pre-upgrade le 2026-10-07.
 *
 *   node_modules/.bin/outil                     -> …/outil/build/index.js  (FICHIER)
 *   .pnpm/outil@1.0.0/node_modules/outil/
 *   .pnpm/outil@1.0.0/node_modules/@moteur      -> .pnpm/@moteur+coeur@1.0.0/…/@moteur
 *   .pnpm/@moteur+coeur@1.0.0/node_modules/@moteur/coeur/
 *
 * `@moteur+coeur@1.0.0` n'a AUCUN lien depuis `node_modules/` racine. Seule une
 * marche transitive correcte le trouve.
 */
function fabriquerMagasinTransitif(): { bac: string; magasin: string } {
  const bac = mkdtempSync(join(tmpdir(), 'elagage-transitif-'));
  bacs.push(bac);

  const modules = join(bac, 'node_modules');
  const magasin = join(modules, '.pnpm');
  const binaires = join(modules, '.bin');
  mkdirSync(binaires, { recursive: true });

  const outil = join(magasin, 'outil@1.0.0', 'node_modules', 'outil');
  mkdirSync(join(outil, 'build'), { recursive: true });
  writeFileSync(join(outil, 'package.json'), JSON.stringify({ name: 'outil', version: '1.0.0' }));
  writeFileSync(join(outil, 'build', 'index.js'), "require('@moteur/coeur');\n");

  const coeur = join(magasin, '@moteur+coeur@1.0.0', 'node_modules', '@moteur', 'coeur');
  mkdirSync(coeur, { recursive: true });
  writeFileSync(join(coeur, 'package.json'), JSON.stringify({ name: '@moteur/coeur', version: '1.0.0' }));

  // la dépendance, posée en VOISINE du paquet dans l'entrée de l'outil
  symlinkSync(
    join('..', '..', '@moteur+coeur@1.0.0', 'node_modules', '@moteur'),
    join(magasin, 'outil@1.0.0', 'node_modules', '@moteur'),
  );

  // le SEUL lien d'entrée : un fichier dans .bin
  symlinkSync(join('..', '.pnpm', 'outil@1.0.0', 'node_modules', 'outil', 'build', 'index.js'), join(binaires, 'outil'));

  // du lest mort, pour que le plancher ne soit pas la raison d'un refus
  for (let i = 0; i < 3; i += 1) {
    const d = join(magasin, `mort-${i}@1.0.0`, 'node_modules', `mort-${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: `mort-${i}`, version: '1.0.0' }));
  }

  return { bac, magasin };
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

  it('garde la dépendance atteignable seulement comme VOISINE — le défaut qui a tué prisma-migrate', () => {
    /*
     * CE TEST EST LA GARDE DU 2026-10-07. Sans la marche transitive corrigée, le
     * script marque `outil@1.0.0` (son lien `.bin` le trouve) puis tente de
     * descendre dans `<fichier>/node_modules`, ce qui n'existe pas : il déclare
     * donc `@moteur+coeur@1.0.0` morte et la supprime. En production, c'était
     * `@prisma/engines`, et le crochet pre-upgrade est mort au démarrage —
     * à des heures de sa cause.
     */
    const { bac } = fabriquerMagasinTransitif();

    expect(entrees(bac), 'témoin : le banc porte 5 entrées').toHaveLength(5);

    const { code, sortie } = lancer(bac, '--supprimer', '--plancher=1');

    expect(code, `l’élagage a échoué :\n${sortie}`).toBe(0);
    expect(sortie, 'les DEUX entrées de la chaîne doivent être atteignables').toMatch(/atteignables\s+: 2/u);

    const survivantes = entrees(bac);
    expect(survivantes, 'l’outil doit survivre').toContain('outil@1.0.0');
    expect(
      survivantes,
      'la dépendance VOISINE doit survivre — c’est tout le défaut : sans elle l’outil meurt sur MODULE_NOT_FOUND',
    ).toContain('@moteur+coeur@1.0.0');

    /* et la résolution tient encore, pas seulement le répertoire */
    const manifeste = JSON.parse(
      readFileSync(join(bac, 'node_modules', '.pnpm', '@moteur+coeur@1.0.0', 'node_modules', '@moteur', 'coeur', 'package.json'), 'utf8'),
    );
    expect(manifeste.name).toBe('@moteur/coeur');
  });

  it('garde la dépendance atteignable seulement par le répertoire HOISTÉ de pnpm', () => {
    /*
     * TROISIÈME TROU DU MÊME MARCHEUR, mesuré le 2026-10-08 dans l'image web
     * reconstruite : le serveur refusait de démarrer sur
     * `Cannot find module '@smithy/util-config-provider'`. L'entrée n'était
     * atteignable ni depuis `node_modules/` racine, ni comme voisine — seulement
     * par `.pnpm/node_modules/`, le répertoire que pnpm hisse (1 124 entrées sur
     * ce dépôt) et que la résolution CJS de Node traverse en remontant.
     */
    const bac = mkdtempSync(join(tmpdir(), 'elagage-hoiste-'));
    bacs.push(bac);

    const modules = join(bac, 'node_modules');
    const magasin = join(modules, '.pnpm');
    const hoiste = join(magasin, 'node_modules');
    mkdirSync(hoiste, { recursive: true });

    const appelant = join(magasin, 'appelant@1.0.0', 'node_modules', 'appelant');
    mkdirSync(appelant, { recursive: true });
    writeFileSync(join(appelant, 'package.json'), JSON.stringify({ name: 'appelant', version: '1.0.0' }));
    symlinkSync(join('.pnpm', 'appelant@1.0.0', 'node_modules', 'appelant'), join(modules, 'appelant'));

    const hisse = join(magasin, 'hisse@1.0.0', 'node_modules', 'hisse');
    mkdirSync(hisse, { recursive: true });
    writeFileSync(join(hisse, 'package.json'), JSON.stringify({ name: 'hisse', version: '1.0.0' }));

    /* le SEUL chemin vers `hisse` : le répertoire hoisté */
    symlinkSync(join('..', 'hisse@1.0.0', 'node_modules', 'hisse'), join(hoiste, 'hisse'));

    for (let i = 0; i < 3; i += 1) {
      const d = join(magasin, `mort-${i}@1.0.0`, 'node_modules', `mort-${i}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'package.json'), JSON.stringify({ name: `mort-${i}`, version: '1.0.0' }));
    }

    expect(entrees(bac), 'témoin : 5 entrées, le répertoire hoisté n’en est pas une').toHaveLength(5);

    const { code, sortie } = lancer(bac, '--supprimer', '--plancher=1');

    expect(code, `l’élagage a échoué :\n${sortie}`).toBe(0);
    expect(sortie, 'les deux entrées doivent être atteignables').toMatch(/atteignables\s+: 2/u);
    expect(
      entrees(bac),
      'l’entrée hissée doit survivre — sans elle l’image ne DÉMARRE pas, et on ne l’apprend qu’au déploiement',
    ).toContain('hisse@1.0.0');
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
