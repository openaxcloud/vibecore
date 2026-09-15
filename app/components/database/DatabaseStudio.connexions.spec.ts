import { describe, expect, it } from 'vitest';

import { readConnections } from './DatabaseStudio';

/*
 * RP-DB-06 — pourquoi « Mes données » restait vide.
 *
 * La route `ide-panel/database` rend DEUX listes :
 *   - `connections` : les bases réellement joignables ;
 *   - `databases`   : uniquement une instance en cours de PROVISIONNEMENT,
 *                     donc `[]` dans le cas normal.
 *
 * Le studio lisait `databases ?? connections`. `??` ne retombe que sur `null`
 * ou `undefined` — jamais sur un tableau vide. La vraie liste n'était donc
 * jamais consultée : `connectionKey` restait vide, aucun schéma n'était
 * demandé, et le panneau affichait « aucune table » sur une base de 127.
 *
 * C'est le piège que ce fichier épingle. Il rougit si quelqu'un réécrit
 * l'expression avec `??`.
 */
describe('readConnections — quelle liste fait foi', () => {
  it('lit `connections` même quand `databases` est un tableau VIDE', () => {
    const conns = readConnections({
      data: {
        databases: [],
        connections: [{ key: 'DATABASE_URL', environment: 'development' }],
      },
    });

    expect(conns.map((c) => c.key)).toEqual(['DATABASE_URL']);
  });

  it('retombe sur `databases` pendant un provisionnement, quand aucune connexion n’existe', () => {
    const conns = readConnections({
      data: { databases: [{ key: 'DATABASE_URL', name: 'development', status: 'PROVISIONING' }], connections: [] },
    });

    expect(conns.map((c) => c.key)).toEqual(['DATABASE_URL']);
  });

  it('rend une liste vide quand il n’y a réellement rien — sans inventer de connexion', () => {
    expect(readConnections({ data: { databases: [], connections: [] } })).toEqual([]);
    expect(readConnections(undefined)).toEqual([]);
  });

  it('accepte l’enveloppe complète comme la charge déjà déballée', () => {
    const attendu = [{ key: 'DATABASE_URL', label: 'DATABASE_URL' }];

    expect(readConnections({ data: { connections: [{ key: 'DATABASE_URL' }] } })).toEqual(attendu);
    expect(readConnections({ connections: [{ key: 'DATABASE_URL' }] })).toEqual(attendu);
  });
});
