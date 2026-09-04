/**
 * L'installation est-elle complète ?
 *
 * Le hook de pré-commit lance `tsc`. Quand une dépendance déclarée manque dans
 * `node_modules`, TypeScript rend `TS2307: Cannot find module 'X'` — une erreur
 * de TYPE, qui envoie chercher un défaut de code là où il n'y en a pas.
 *
 * Mesuré le 2026-09-04 sur `main` vierge : `esbuild@0.27.7` était déclaré et
 * absent. Le pré-commit refusait tout commit, en accusant un fichier source qui
 * n'avait pas changé depuis des semaines. Une seule commande le réparait —
 * encore fallait-il savoir laquelle.
 *
 * On ne vérifie que les dépendances de la RACINE : ce sont celles que `tsc`
 * résout depuis les tsconfig de premier niveau, donc celles dont l'absence
 * produit ce message trompeur.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Non installables — fournies par la plateforme ou par un chemin d'espace de travail. */
const IGNOREES = new Set(['@types/node']);

export function dependancesManquantes(manifeste, existe = (chemin) => existsSync(chemin)) {
  const declarees = { ...(manifeste.dependencies ?? {}), ...(manifeste.devDependencies ?? {}) };

  return Object.entries(declarees)
    .filter(([nom, version]) => {
      if (IGNOREES.has(nom)) return false;

      // `workspace:*` et `link:` pointent dans le dépôt : leur absence est un
      // autre problème, qui ne se répare pas par une réinstallation.
      if (typeof version === 'string' && /^(workspace|link|file):/.test(version)) return false;

      return !existe(resolve('node_modules', nom, 'package.json'));
    })
    .map(([nom]) => nom);
}

export function messageInstallation(manquantes) {
  if (manquantes.length === 0) return null;

  const liste = manquantes.slice(0, 8).join(', ');
  const reste = manquantes.length > 8 ? ` (+${manquantes.length - 8} autres)` : '';

  return [
    '',
    `❌ Installation incomplète : ${manquantes.length} dépendance(s) déclarée(s) mais absente(s) de node_modules.`,
    `   ${liste}${reste}`,
    '',
    '   Sans elles, TypeScript rendra « Cannot find module » sur des fichiers que',
    "   vous n'avez pas touchés. Ce n'est pas une erreur de votre code.",
    '',
    '   Réparation :  pnpm install --frozen-lockfile',
    '',
  ].join('\n');
}

/** Exécution directe : le typecheck s'en sert avant de lancer tsc. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const manifeste = JSON.parse(readFileSync('package.json', 'utf8'));
  const message = messageInstallation(dependancesManquantes(manifeste));

  if (message) {
    console.error(message);
    process.exit(1);
  }
}
