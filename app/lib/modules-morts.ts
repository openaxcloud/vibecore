import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
   * Deux GARDES dont le produit est leur spec, exactement comme celle-ci :
   * `ide-panel-density` relit la feuille de style et refuse un retour à une
   * colonne unique ; `live-audit-heuristics` est l'outil de l'audit i18n live
   * (`tests/e2e/i18n-french-live.spec.ts`). Aucun chemin produit ne doit les
   * appeler — les forcer serait le geste que la règle interdit. Nommées ici,
   * avec leur raison, plutôt que laissées dans la ligne de base où elles se
   * liraient comme des dettes à câbler.
   */
  'app/lib/ui/ide-panel-density.ts',
  'app/lib/i18n/catalogs/live-audit-heuristics.ts',

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

  /*
   * Un BARREL (`index.ts`) n'est pas une cible : il ne porte aucune logique,
   * seulement des ré-exports, et il est consommé par le NOM DE SON DOSSIER
   * (`from '~/lib/hooks'`) — un spécificateur dont le dernier segment n'est
   * pas `index`, que l'appariement par nom ne peut donc pas voir. Mesuré le
   * 2026-09-15 en élargissant le balayage à `packages/` : un spec y
   * important `./index` faisait apparaître TROIS barrels de `app/lib` comme
   * « morts ». Le nom `index` est partagé par trop de fichiers pour qu'un
   * appariement par nom le distingue.
   */
  const cibles = [...parChemin.keys()].filter(
    (chemin) =>
      !estSpec(chemin) &&
      !chemin.endsWith('.d.ts') &&
      !/\/index\.tsx?$/u.test(chemin) &&
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

/**
 * Répertoires où un IMPORTATEUR peut vivre. Les cibles restent `app/lib` et
 * `app/utils`, mais leurs appelants ne sont pas tous dans `app/` : mesuré le
 * 2026-09-15, `apps/admin/src/i18n.ts` importe `~/lib/i18n/catalogs/admin`,
 * et la première version de ce scanner — qui ne lisait que `app/` — déclarait
 * ce catalogue mort. Un faux positif de plus, de la même famille que celui de
 * `debugLogger` : chercher sur une cible trop étroite rend un « rien trouvé »
 * qui se lit comme « personne ne l'appelle ».
 */
export const RACINES_DES_IMPORTATEURS = ['app', 'apps', 'services', 'packages', 'tests', 'scripts'] as const;

/** Répertoires ignorés en descendant : dépendances et sorties de génération. */
const REPERTOIRES_IGNORES = new Set(['node_modules', 'generated', 'dist', 'build', '.turbo']);

/** Lit tous les `.ts`/`.tsx` des racines surveillées, chemins relatifs à la racine du dépôt. */
export function lireSources(racineDepot: string): Fichier[] {
  const fichiers: Fichier[] = [];

  const parcourir = (repertoire: string): void => {
    for (const entree of readdirSync(repertoire)) {
      if (REPERTOIRES_IGNORES.has(entree)) {
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

  for (const racine of RACINES_DES_IMPORTATEURS) {
    const complet = join(racineDepot, racine);

    if (existsSync(complet)) {
      parcourir(complet);
    }
  }

  return fichiers;
}
