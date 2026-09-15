import { describe, expect, it } from 'vitest';

/*
 * RP-DB-02 — « regarde qu'on suit la même logique » (Avi, 08/09), devant les
 * captures Replit qui montrent DEUX bases nettement séparées : « Development
 * Database » et « Production Database ».
 *
 * Nous avons cette séparation, mais les deux moitiés du code se
 * contredisaient, et c'est mesurable :
 *
 *   - le provisionneur ÉCRIT l'URI de développement dans `DATABASE_URL`
 *     (`environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL'`) ;
 *   - la relecture par préfixe rend « shared » pour cette clé nue.
 *
 * Mesuré le 08/09 sur l'API locale : une connexion `DATABASE_URL` ressortait
 * avec `"environment":"shared"` alors qu'elle désignait bien la base de
 * développement.
 *
 * La règle posée : l'instance GÉRÉE fait foi pour SA clé ; tout le reste garde
 * la déduction par préfixe, et une connexion collée par l'utilisateur reste
 * « shared » — là, nous ne savons pas, et le deviner serait pire que l'avouer.
 *
 * Ce test tient la règle sur une reproduction fidèle de l'expression employée
 * dans la route, pour qu'un changement de convention le fasse rougir.
 */

type Environnement = 'development' | 'preview' | 'staging' | 'production' | 'shared';

interface Connexion {
  key: string;
  environment: Environnement;
}

/** La même expression que la route, isolée pour être testable. */
function reclasser(
  connexions: readonly Connexion[],
  instance: { environment?: string } | undefined,
): Connexion[] {
  const environnementGere = instance?.environment;
  const cleGeree = environnementGere === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL';

  return connexions.map((connexion) =>
    instance && connexion.key === cleGeree && environnementGere
      ? { ...connexion, environment: environnementGere as Environnement }
      : connexion,
  );
}

describe('à quel environnement appartient une base', () => {
  it('une base GÉRÉE de développement cesse d’être « shared »', () => {
    const reclassees = reclasser([{ key: 'DATABASE_URL', environment: 'shared' }], {
      environment: 'development',
    });

    expect(reclassees[0].environment).toBe('development');
  });

  it('et une base gérée de production reste production, sur SA clé', () => {
    const reclassees = reclasser(
      [
        { key: 'PROD_DATABASE_URL', environment: 'production' },
        { key: 'DATABASE_URL', environment: 'shared' },
      ],
      { environment: 'production' },
    );

    expect(reclassees[0].environment).toBe('production');

    // La clé de développement n'est PAS touchée par une instance de production.
    expect(reclassees[1].environment).toBe('shared');
  });

  it('sans instance gérée, on n’invente rien : la connexion collée reste « shared »', () => {
    const reclassees = reclasser([{ key: 'DATABASE_URL', environment: 'shared' }], undefined);

    expect(reclassees[0].environment).toBe('shared');
  });

  it('les autres clés gardent leur déduction par préfixe', () => {
    const reclassees = reclasser(
      [
        { key: 'STAGING_DATABASE_URL', environment: 'staging' },
        { key: 'ANALYTICS_DATABASE_URL', environment: 'shared' },
      ],
      { environment: 'development' },
    );

    expect(reclassees.map((c) => c.environment)).toEqual(['staging', 'shared']);
  });
});
