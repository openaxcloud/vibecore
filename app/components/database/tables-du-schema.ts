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

/**
 * Déballe l'enveloppe de la route ide-panel avant de lire le schéma.
 *
 * La route rend `{ ok, data: { …, schema } }` ; certains appelants passent déjà
 * `data`, d'autres l'enveloppe entière. Un lecteur qui ne connaît qu'une des
 * deux formes rend un résultat VIDE sur l'autre — sans erreur, donc sans
 * signal : c'est ce qui est arrivé au rail de « Mes données », qui affichait
 * « aucune table » sur une base de 127 tables. Le déballage vit ici, une fois,
 * pour qu'aucun appelant n'ait à y penser.
 */
function schemaDe(donnees: unknown): Record<string, unknown> {
  const racine = (donnees && typeof donnees === 'object' ? donnees : {}) as Record<string, unknown>;
  const enveloppe = (racine.data && typeof racine.data === 'object' ? racine.data : racine) as Record<string, unknown>;

  return (enveloppe.schema && typeof enveloppe.schema === 'object' ? enveloppe.schema : enveloppe) as Record<
    string,
    unknown
  >;
}

/** Une valeur de texte utile, ou la chaîne vide — jamais « undefined » ni « null » affichés. */
function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
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
  const schema = schemaDe(donnees);

  const brutes = schema.tables;

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
  const schema = schemaDe(donnees);

  return nombre(schema.databaseSizeBytes);
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

/** Une colonne, telle qu'on veut l'afficher : son nom et son type SQL lisible. */
export interface ColonneDuSchema {
  nom: string;
  type: string;
}

/**
 * RP-DB-06 — les colonnes d'une table.
 *
 * L'API rend les colonnes en UNE liste PLATE, pour toutes les tables à la
 * fois : `{ table_schema, table_name, column_name, data_type, … }`. La vue
 * « Mes données », elle, cherchait `table.columns` — une clé qui n'existe sur
 * aucune table — et lisait le nom de la table dans `name` alors que l'API rend
 * `table_name`. Les deux formes ne se rencontraient jamais : mesuré le 09/09
 * sur une vraie base, la charge utile portait 127 tables et 1000 colonnes, et
 * le rail de « Mes données » en affichait ZÉRO.
 *
 * C'est le MÊME mécanisme que RP-DB-05, à un second endroit. La jointure vit
 * donc ici, avec le reste, pour qu'il n'y ait plus deux lecteurs à corriger.
 */
export function colonnesDuSchema(donnees: unknown): Map<string, ColonneDuSchema[]> {
  const schema = schemaDe(donnees);

  const brutes = Array.isArray(schema.columns) ? schema.columns : [];
  const parTable = new Map<string, ColonneDuSchema[]>();

  for (const brute of brutes) {
    const o = (brute && typeof brute === 'object' ? brute : {}) as Record<string, unknown>;
    const table = texte(o.table_name ?? o.tableName ?? o.table);
    const nom = texte(o.column_name ?? o.columnName ?? o.name);

    if (!table || !nom) {
      continue;
    }

    const liste = parTable.get(table) ?? [];

    liste.push({ nom, type: typeDeColonne(o) });
    parTable.set(table, liste);
  }

  return parTable;
}

/**
 * Le type SQL tel qu'un humain l'écrirait.
 *
 * `information_schema` rend « character varying » et met la longueur dans une
 * colonne à part. Replit affiche « varchar(255) » : c'est la même information,
 * dans la forme que l'utilisateur reconnaît. Quand la longueur n'est pas
 * fournie, on rend le type seul plutôt que d'inventer une borne.
 */
export function typeDeColonne(entree: Record<string, unknown>): string {
  const brut = texte(entree.data_type ?? entree.dataType ?? entree.type);

  if (!brut) {
    return '';
  }

  const abrege =
    { 'character varying': 'varchar', 'timestamp without time zone': 'timestamp', character: 'char' }[brut] ?? brut;

  const longueur = nombre(entree.character_maximum_length ?? entree.characterMaximumLength);

  return typeof longueur === 'number' && longueur > 0 ? `${abrege}(${longueur})` : abrege;
}
