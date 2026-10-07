#!/usr/bin/env node
/*
 * ÉLAGUER LES ENTRÉES MORTES DU MAGASIN pnpm D'UNE IMAGE DE PRODUCTION.
 *
 * POURQUOI. Mesuré le 2026-10-06 en sondant les images refusées par la porte de
 * vulnérabilité, depuis l'intérieur du cluster :
 *
 *     image   entrées dans .pnpm   atteignables   MORTES
 *     web            1 554              154       1 400  (90 %)
 *     admin          1 461              164       1 297  (89 %)
 *
 * Neuf entrées sur dix ne sont référencées par AUCUN lien symbolique. Elles ne
 * peuvent donc pas être chargées par la résolution de Node — et elles portent
 * quand même leurs failles. Les deux CVE CRITIQUES qui bloquaient la livraison
 * étaient exactement là :
 *
 *     CVE-2026-103922  @capacitor/android 8.3.1  → image web,   0 atteinte
 *     CVE-2026-104848  tinypool 1.1.1            → image admin, 0 atteinte
 *
 * `pnpm prune --prod` et `pnpm deploy --prod` ne les retirent pas : dans un
 * espace de travail, `node_modules/.pnpm` est le magasin PARTAGÉ des 36 projets,
 * et élaguer les liens d'un projet ne ramasse pas le magasin. Le manifeste
 * déployé est juste — `/runtime/package.json` déclare 4 dépendances et 0 de
 * développement — mais le magasin à côté en contient 1 461.
 *
 * SÛRETÉ. Une entrée qu'aucun lien ne résout ne peut pas être requise : la
 * supprimer ne change pas ce que le programme peut charger. C'est ce qui rend ce
 * ramassage sûr par construction, et non une pari sur ce qui « sert ».
 *
 * GARDE-FOUS, parce qu'un ramasse-miettes qui se trompe vide une image :
 *   1. refus si le marquage rend MOINS d'entrées atteignables qu'un plancher —
 *      un parcours cassé rendrait zéro, et zéro atteint voudrait dire « tout est
 *      mort » ;
 *   2. refus si le magasin est introuvable, plutôt que de réussir sans rien faire ;
 *   3. `--dry-run` par défaut : il faut `--supprimer` pour effacer quoi que ce soit ;
 *   4. le compte avant/après est imprimé, donc le journal de construction PROUVE
 *      ce qui a été retiré.
 */
import { readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const racine = args.find((a) => !a.startsWith('--'));
const supprimer = args.includes('--supprimer');
const plancher = Number(args.find((a) => a.startsWith('--plancher='))?.split('=')[1] ?? 20);

if (!racine) {
  console.error('usage : elaguer-magasin-pnpm.mjs <racine-du-projet> [--supprimer] [--plancher=N]');
  process.exit(2);
}

const modules = join(racine, 'node_modules');
const magasin = join(modules, '.pnpm');

try {
  if (!statSync(magasin).isDirectory()) {
    throw new Error('pas un répertoire');
  }
} catch (error) {
  console.error(`✖ magasin introuvable : ${magasin} (${error.message})`);
  console.error('  Un élagage qui ne trouve pas le magasin doit ÉCHOUER, pas réussir sans rien faire.');
  process.exit(1);
}

const IGNORER = new Set(['node_modules', 'lock.yaml']);
const entrees = readdirSync(magasin).filter((n) => !IGNORER.has(n));

/* ---- marquage : tout ce qu'un lien symbolique atteint, de proche en proche ---- */

const atteintes = new Set();

function suivre(repertoire, profondeur) {
  if (profondeur > 14) {
    return;
  }

  let contenu;

  try {
    contenu = readdirSync(repertoire, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entree of contenu) {
    const chemin = join(repertoire, entree.name);

    if (entree.isSymbolicLink()) {
      let cible;

      try {
        cible = realpathSync(chemin);
      } catch {
        continue;
      }

      const trouve = /\/\.pnpm\/([^/]+)\//u.exec(cible);

      if (trouve && !atteintes.has(trouve[1])) {
        atteintes.add(trouve[1]);

        /*
         * LES DÉPENDANCES D'UNE ENTRÉE SONT SES VOISINES, PAS SES FILLES.
         *
         * Dans un magasin pnpm, `.pnpm/<entrée>/node_modules/` contient le paquet
         * ET les liens vers ses dépendances, côte à côte :
         *
         *     .pnpm/prisma@7.8.0_…/node_modules/
         *       ├── prisma        ← le paquet
         *       ├── @prisma       ← sa dépendance (@prisma/engines)
         *       ├── mysql2
         *       └── postgres
         *
         * `prisma/node_modules/` n'existe pas. Descendre depuis `cible` — qui vaut
         * `.pnpm/<entrée>/node_modules/<paquet>`, ou carrément un FICHIER quand le
         * lien vient de `node_modules/.bin/` — ne trouvait donc rien, et le
         * marquage s'arrêtait au premier niveau.
         *
         * Mesuré le 2026-10-07 : le crochet pre-upgrade `prisma-migrate` est mort
         * sur `Cannot find module '@prisma/engines'`. `prisma` avait survécu (son
         * lien `.bin` l'avait marqué) mais `@prisma/engines`, voisine et non fille,
         * avait été supprimée. Helm a reverti tout seul (`--atomic`) : la
         * production n'a jamais changé.
         *
         * On repart donc du magasin et du nom de l'entrée, jamais de `cible`.
         */
        suivre(join(magasin, trouve[1], 'node_modules'), profondeur + 1);
      }

      continue;
    }

    /*
     * On descend dans les répertoires de portée (`@vibecore`) et, au premier
     * niveau, dans `node_modules` lui-même. Inutile d'explorer plus : les liens
     * vivent à ces deux endroits.
     */
    if (entree.isDirectory() && (entree.name.startsWith('@') || profondeur === 0)) {
      suivre(chemin, profondeur + 1);
    }
  }
}

suivre(modules, 0);

const mortes = entrees.filter((n) => !atteintes.has(n));

console.log(`élagage du magasin pnpm — ${racine}`);
console.log(`  entrées dans .pnpm   : ${entrees.length}`);
console.log(`  atteignables         : ${atteintes.size}`);
console.log(`  mortes               : ${mortes.length}`);

if (atteintes.size < plancher) {
  console.error(
    `✖ seulement ${atteintes.size} entrée(s) atteignable(s), plancher ${plancher} : ` +
      'le parcours des liens a probablement échoué. Rien n’est supprimé.',
  );
  process.exit(1);
}

if (!supprimer) {
  console.log('  (simulation : relancer avec --supprimer pour effacer)');
  process.exit(0);
}

let effacees = 0;

for (const nom of mortes) {
  rmSync(join(magasin, nom), { recursive: true, force: true });
  effacees += 1;
}

const restantes = readdirSync(magasin).filter((n) => !IGNORER.has(n)).length;

console.log(`  supprimées           : ${effacees}`);
console.log(`  restantes            : ${restantes}`);

if (restantes !== atteintes.size) {
  console.error(`✖ après élagage il reste ${restantes} entrée(s) pour ${atteintes.size} atteignable(s) — incohérent.`);
  process.exit(1);
}

console.log('✔ magasin élagué : il ne reste que ce que la résolution peut atteindre.');
