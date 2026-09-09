import { describe, expect, it } from 'vitest';

import { nomDeLaBase, tablesDuSchema, tailleDeLaBase } from './tables-du-schema';

/*
 * RP-DB-05 — défaut MESURÉ le 08/09.
 *
 * La vue lisait `t.name` / `t.rowCount` ; l'API rend `table_name` et
 * `rowsEstimate`. Les deux formes ne se rencontraient jamais : chaque table
 * s'affichait avec un nom VIDE et sans compte de lignes, et comme la clé React
 * valait ce nom vide, toutes les tables partageaient la même. Relevé à
 * l'écran : 0 table rendue.
 *
 * La charge utile ci-dessous est celle que l'API a réellement rendue ce
 * jour-là, sur la base locale (127 tables, 53,03 Mo).
 */
const REPONSE_REELLE = {
  schema: {
    tables: [
      {
        table_schema: 'public',
        table_name: 'AuditLog',
        table_type: 'BASE TABLE',
        rowsEstimate: 10109,
        sizeBytes: 6561792,
      },
      { table_schema: 'public', table_name: 'AbuseEvent', table_type: 'BASE TABLE', rowsEstimate: 0, sizeBytes: 24576 },
    ],
    databaseSizeBytes: 55606295,
  },
};

describe('tables du schéma', () => {
  it('lit la forme que l’API rend VRAIMENT', () => {
    const tables = tablesDuSchema(REPONSE_REELLE);

    expect(tables).toHaveLength(2);
    expect(tables[0]).toEqual({ nom: 'AuditLog', schema: 'public', lignes: 10109, octets: 6561792 });

    // Le cas qui comptait à l'écran : une table vide dit « 0 », pas « rien ».
    expect(tables[1].lignes).toBe(0);
  });

  it('accepte aussi l’ancienne forme, pour ne casser aucun connecteur', () => {
    const tables = tablesDuSchema({ tables: [{ name: 'clients', rowCount: 42 }] });

    expect(tables).toEqual([{ nom: 'clients', lignes: 42, octets: undefined }]);
  });

  it('écarte une entrée SANS nom au lieu d’en rendre une vide', () => {
    /* C'est ce qui donnait des clés React identiques et un nom invisible. */
    expect(tablesDuSchema({ tables: [{ rowsEstimate: 3 }, { table_name: '   ' }, { table_name: 'ok' }] })).toEqual([
      { nom: 'ok', lignes: undefined, octets: undefined },
    ]);
  });

  it('ne rend rien quand il n’y a rien, sans jamais lever', () => {
    expect(tablesDuSchema(undefined)).toEqual([]);
    expect(tablesDuSchema({})).toEqual([]);
    expect(tablesDuSchema({ schema: { tables: 'pas un tableau' } })).toEqual([]);
  });

  it('refuse un compte de lignes qui n’en est pas un', () => {
    const [table] = tablesDuSchema({ tables: [{ table_name: 't', rowsEstimate: -1 }] });

    expect(table.lignes).toBeUndefined();
  });

  it('rend la taille de la base quand l’API la mesure, et rien sinon', () => {
    expect(tailleDeLaBase(REPONSE_REELLE)).toBe(55606295);
    expect(tailleDeLaBase({ schema: {} })).toBeUndefined();
    expect(tailleDeLaBase(undefined)).toBeUndefined();
  });
});

describe('nom d’une base', () => {
  const libelles = {
    'databaseWorkbench.env.development': 'Base de développement',
    'databaseWorkbench.env.production': 'Base de production',
  };

  it('nomme par l’environnement, comme Replit', () => {
    expect(nomDeLaBase({ key: 'DATABASE_URL', environment: 'development' }, libelles)).toBe('Base de développement');
    expect(nomDeLaBase({ key: 'PROD_DATABASE_URL', environment: 'production' }, libelles)).toBe('Base de production');
  });

  it('un environnement INDÉTERMINÉ garde la clé : on ne prétend pas savoir', () => {
    expect(nomDeLaBase({ key: 'DATABASE_URL', environment: 'shared' }, libelles)).toBe('DATABASE_URL');
    expect(nomDeLaBase({ key: 'AUTRE_URL' }, libelles)).toBe('AUTRE_URL');
  });

  it('un nom explicite l’emporte sur tout le reste', () => {
    expect(nomDeLaBase({ name: 'Ma base', key: 'DATABASE_URL', environment: 'development' }, libelles)).toBe('Ma base');
  });
});
