import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * LE MODULE QUE SEUL SON PROPRE SPEC IMPORTE.
 *
 * C'est le défaut dominant de cette campagne, et il ne ressemble pas à un
 * défaut : le code est juste, le spec est vert, la revue passe. Il manque
 * seulement l'appel. Quatre cas mesurés le 2026-09-10, tous corrigés
 * séparément parce que RIEN ne les rendait visibles :
 *
 *   - `analyserGeneration` — la garde d'honnêteté d'une génération tronquée,
 *     écrite, testée, appelée nulle part ;
 *   - `AppliedFilesToast.constat` — la moitié VISIBLE de cette même garde, une
 *     prop que son unique appelant n'acceptait même pas ;
 *   - `aptitude-fournisseur` — « zéro fichier sur une consigne de construction
 *     = fournisseur inapte », avec ses quatre gardes et son spec vert ;
 *   - `generation-incomplete` — la règle de troncature, dans le même état.
 *
 * Les corriger un par un ne protège de rien : rien n'empêche le cinquième
 * d'apparaître demain. Ce module mesure la RÈGLE.
 *
 * CE QU'IL NE FAIT PAS, ET POURQUOI. Il ne regarde ni les routes ni les
 * composants. Une route est montée par le routeur sans jamais être importée, et
 * un composant l'est souvent par un chemin que l'analyse statique ne suit pas :
 * un garde qui les accuse accuse 200 fichiers sains, et un garde qui accuse ce
 * qui va bien finit désactivé. La leçon est déjà écrite dans l'inventaire
 * (BUG-BUILD-ROUTE-EXPORT-001, garde tentée puis RETIRÉE pour cette raison
 * exacte). La portée est donc `app/lib/**` et `app/utils/**` — de la logique
 * pure, qui n'existe que pour être appelée.
 */

/** Répertoires balayés : de la logique, jamais des routes ni des composants. */
export const RACINES_SURVEILLEES = ['app/lib', 'app/utils'] as const;

/**
 * Exception unique et justifiée : un HARNAIS de test n'a pas d'autre appelant
 * qu'un spec, c'est sa raison d'être. Toute autre exception doit être discutée,
 * pas ajoutée ici en silence.
 */
export const EXCEPTIONS = [
  /* Un HARNAIS de test n'a pas d'autre appelant qu'un spec : c'est sa raison d'être. */
  'app/lib/test/',

  /*
   * Cette garde elle-même. Son PRODUIT est le test — il n'existe aucun chemin
   * produit qui doive l'appeler, et l'y forcer serait exactement le geste que la
   * règle interdit : câbler du code pour qu'il ne soit plus mort. L'exception est
   * nommée ici plutôt que dans la ligne de base parce qu'elle est structurelle,
   * pas un état à corriger un jour.
   */
  'app/lib/modules-morts.ts',
] as const;

export interface Fichier {
  chemin: string;
  contenu: string;
}

export function estSpec(chemin: string): boolean {
  return chemin.includes('.spec.') || chemin.includes('.test.');
}

function sansExtension(chemin: string): string {
  return chemin.replace(/\.tsx?$/u, '');
}

/**
 * Les spécificateurs importés par un fichier — `import … from`, `export … from`
 * et `import(…)` dynamique. Oublier le dynamique déclarerait mort un module
 * chargé paresseusement, ce qui est un faux positif coûteux : il enverrait
 * câbler du code déjà câblé.
 */
export function specificateursImportes(contenu: string): string[] {
  const statiques = [...contenu.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((m) => m[1]);
  const dynamiques = [...contenu.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu)].map((m) => m[1]);

  return [...statiques, ...dynamiques];
}

/**
 * Les modules de la portée dont TOUS les importateurs sont des specs.
 *
 * Un module que PERSONNE n'importe est une autre classe — point d'entrée,
 * module chargé par convention — et n'est pas rendu ici : le confondre avec
 * celui-ci mélangerait deux causes sous un seul chiffre.
 */
export function modulesImportesSeulementParLeurSpec(fichiers: readonly Fichier[]): string[] {
  const parChemin = new Map(fichiers.map((f) => [f.chemin, f]));
  const importsPar = new Map(fichiers.map((f) => [f.chemin, specificateursImportes(f.contenu)]));

  const cibles = [...parChemin.keys()].filter(
    (chemin) =>
      !estSpec(chemin) &&
      !chemin.endsWith('.d.ts') &&
      RACINES_SURVEILLEES.some((racine) => chemin.startsWith(`${racine}/`)) &&
      !EXCEPTIONS.some((exception) => chemin.startsWith(exception)),
  );

  const morts: string[] = [];

  for (const cible of cibles) {
    const nom = sansExtension(cible).split('/').pop();

    if (!nom) {
      continue;
    }

    let auMoinsUn = false;
    let tousDesSpecs = true;

    for (const [chemin, specificateurs] of importsPar) {
      if (chemin === cible) {
        continue;
      }

      if (!specificateurs.some((s) => s.split('/').pop() === nom)) {
        continue;
      }

      auMoinsUn = true;

      if (!estSpec(chemin)) {
        tousDesSpecs = false;
        break;
      }
    }

    if (auMoinsUn && tousDesSpecs) {
      morts.push(cible);
    }
  }

  return morts.sort();
}

/** Lit tous les `.ts`/`.tsx` sous `app/`, chemins relatifs à la racine du dépôt. */
export function lireSources(racineDepot: string): Fichier[] {
  const fichiers: Fichier[] = [];

  const parcourir = (repertoire: string): void => {
    for (const entree of readdirSync(repertoire)) {
      if (entree === 'node_modules') {
        continue;
      }

      const complet = join(repertoire, entree);

      if (statSync(complet).isDirectory()) {
        parcourir(complet);
        continue;
      }

      if (!/\.tsx?$/u.test(entree)) {
        continue;
      }

      fichiers.push({
        chemin: relative(racineDepot, complet).split(sep).join('/'),
        contenu: readFileSync(complet, 'utf8'),
      });
    }
  };

  parcourir(join(racineDepot, 'app'));

  return fichiers;
}
