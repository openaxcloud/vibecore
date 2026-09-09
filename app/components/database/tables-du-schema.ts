/*
 * RP-DB-05 — « Tables », avec « N rows » sous chaque nom (captures d'Avi,
 * 08/09 21:07).
 *
 * Ce module existe à cause d'un défaut mesuré le 08/09 : la vue lisait
 * `t.name` / `t.rowCount`, alors que l'API rend `table_name` et — depuis
 * l'enrichissement du même jour — `rowsEstimate`. Aucune des deux formes ne se
 * rencontrait, donc CHAQUE table s'affichait avec un nom VIDE et sans compte
 * de lignes. Relevé à l'écran : 0 table rendue.
 *
 * La normalisation vit donc ici, seule et testée, plutôt qu'en ligne dans le
 * JSX où rien ne la tenait.
 */

export interface TableDuSchema {
  nom: string;
  schema?: string;
  lignes?: number;
  octets?: number;
}

function nombre(valeur: unknown): number | undefined {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur;

  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/*
 * Les noms de champ acceptés couvrent les DEUX mondes :
 *   - `table_name` / `rowsEstimate` / `sizeBytes` — ce que rend notre API ;
 *   - `name` / `table` / `rowCount` — la forme qu'attendait la vue, gardée
 *     pour qu'un connecteur qui la produirait ne casse pas.
 */
export function tablesDuSchema(donnees: unknown): TableDuSchema[] {
  const racine = (donnees && typeof donnees === 'object' ? donnees : {}) as Record<string, unknown>;

  const schema = (racine.schema && typeof racine.schema === 'object' ? racine.schema : racine) as Record<
    string,
    unknown
  >;

  const brutes = schema.tables ?? racine.tables;

  if (!Array.isArray(brutes)) {
    return [];
  }

  return brutes
    .map((entree): TableDuSchema | null => {
      const t = (entree && typeof entree === 'object' ? entree : {}) as Record<string, unknown>;

      const nom = [t.table_name, t.tableName, t.name, t.table].find(
        (valeur): valeur is string => typeof valeur === 'string' && valeur.trim().length > 0,
      );

      if (!nom) {
        return null;
      }

      const schemaNom = [t.table_schema, t.tableSchema, t.schema].find(
        (valeur): valeur is string => typeof valeur === 'string' && valeur.trim().length > 0,
      );

      return {
        nom,
        ...(schemaNom ? { schema: schemaNom } : {}),
        lignes: nombre(t.rowsEstimate ?? t.rowCount ?? t.rows),
        octets: nombre(t.sizeBytes ?? t.size),
      };
    })
    .filter((table): table is TableDuSchema => table !== null);
}

/** La taille de la base, quand l'API la mesure — jamais un chiffre inventé. */
export function tailleDeLaBase(donnees: unknown): number | undefined {
  const racine = (donnees && typeof donnees === 'object' ? donnees : {}) as Record<string, unknown>;

  const schema = (racine.schema && typeof racine.schema === 'object' ? racine.schema : racine) as Record<
    string,
    unknown
  >;

  return nombre(schema.databaseSizeBytes ?? racine.databaseSizeBytes);
}

/*
 * RP-DB-02 / RP-DB-08 — le NOM d'une base.
 *
 * Replit écrit « Development Database » et « Production Database ». Chez nous
 * la carte affichait « DATABASE_URL » : les connexions rendues par l'API
 * portent une `key` et un `environment`, jamais un `name`, et la vue retombait
 * donc sur la clé.
 *
 * On nomme désormais par l'ENVIRONNEMENT — ce qui n'a de sens que depuis que
 * celui-ci est juste (l'instance gérée fait foi pour sa clé, corrigé le même
 * jour). Un environnement « shared », lui, ne se traduit pas : la clé reste le
 * nom, parce que nous ne savons effectivement pas de quelle base il s'agit.
 */
export function nomDeLaBase(
  entree: { name?: unknown; label?: unknown; displayName?: unknown; environment?: unknown; key?: unknown },
  libelles: Readonly<Record<string, string>>,
): string {
  const explicite = [entree.name, entree.label, entree.displayName].find(
    (valeur): valeur is string => typeof valeur === 'string' && valeur.trim().length > 0,
  );

  if (explicite) {
    return explicite;
  }

  const environnement = typeof entree.environment === 'string' ? entree.environment : '';
  const libelle = libelles[`databaseWorkbench.env.${environnement}`];

  return libelle ?? (typeof entree.key === 'string' ? entree.key : '');
}
