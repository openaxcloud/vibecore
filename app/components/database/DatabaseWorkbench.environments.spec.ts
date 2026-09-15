import { describe, expect, it } from 'vitest';

import { provisionFailureCopyKey, provisionFailureReason, readEnvironments } from './DatabaseWorkbench';

/**
 * « LE BOUTON CRÉER UNE BASE DE DONNÉES NE FAIT RIEN » — signalé en live sur
 * app.e-code.ai, mobile 390 et bureau.
 *
 * Le bouton EST branché, la requête PART et le provisionnement peut même
 * ABOUTIR : le défaut est que le panneau ne peut afficher AUCUNE base, jamais.
 *
 * `GET /projects/:id/databases` renvoie DEUX champs de sens différent :
 *
 *   - `connections` : les bases réelles du projet, des OBJETS portant `key`,
 *     `kind`, `environment`…
 *   - `environments` : la liste des NOMS d'environnement possibles, des CHAÎNES
 *     (`'development'`, `'preview'`, …) — une constante, jamais vide.
 *
 * Le lecteur du panneau prenait `c.environments ?? c.databases ?? c.connections`.
 * Comme `environments` est toujours présent, `??` ne retombait JAMAIS sur
 * `connections` : il itérait des chaînes, dont aucune n'expose de `key`, et les
 * écartait toutes. Le panneau rendait donc l'état vide « Aucune base de données
 * pour le moment » quoi qu'il arrive — y compris juste après un provisionnement
 * réussi. Vu de l'utilisateur : on appuie, et rien ne se passe.
 *
 * Ces tests sont ancrés sur la fonction RÉELLEMENT utilisée par le composant,
 * pas sur une copie, et sur la charge utile réellement produite par l'API.
 */

/** Charge utile réelle de `GET /projects/:id/databases`, telle que l'API la construit. */
const CHARGE_API = {
  connections: [
    {
      key: 'DATABASE_URL',
      source: 'secret',
      kind: 'postgres',
      maskedUrl: 'postgresql://***@db-cmsp.../app',
      environment: 'development',
      capabilities: ['schema', 'readonly-sql', 'query'],
    },
  ],
  environments: ['development', 'preview', 'staging', 'production', 'shared'],
};

describe('panneau Base de données — lecture des bases du projet', () => {
  it('rend la base provisionnée, alors que `environments` porte des noms', () => {
    const envs = readEnvironments(CHARGE_API);

    expect(envs, 'la base réelle doit être rendue').toHaveLength(1);
    expect(envs[0].key).toBe('DATABASE_URL');
  });

  it('ne prend JAMAIS une chaîne pour une base', () => {
    /*
     * Le cœur du défaut : `environments` est une constante non vide, donc un
     * `??` ne peut pas servir de repli. Si le lecteur y voyait des bases, il
     * en inventerait cinq pour un projet qui n'en a aucune.
     */
    const envs = readEnvironments({ environments: ['development', 'preview', 'staging', 'production', 'shared'] });

    expect(envs, 'aucune base : le projet n’en a pas').toEqual([]);
  });

  it('écarte une source de CHAÎNES même si elle vient AVANT la vraie liste', () => {
    /*
     * Le vrai correctif n'est pas l'ordre des sources, c'est de n'accepter
     * qu'une source décrivant des OBJETS. Sans ce filtre, il suffit qu'un champ
     * antérieur porte un tableau de chaînes non vide pour masquer à nouveau
     * toutes les bases — le défaut d'origine, déplacé d'un champ.
     */
    const envs = readEnvironments({
      databases: ['development', 'production'],
      connections: [{ key: 'DATABASE_URL', name: 'Dev' }],
      environments: ['development', 'production'],
    });

    expect(envs, 'la vraie base ne doit pas être masquée par des chaînes').toHaveLength(1);
    expect(envs[0].key).toBe('DATABASE_URL');
  });

  it('garde l’état vide honnête quand le projet n’a réellement aucune base', () => {
    expect(readEnvironments({ connections: [], environments: ['development', 'production'] })).toEqual([]);
  });

  it('lit aussi une base encore en cours de provisionnement, avec son statut', () => {
    /*
     * Sans cela, la fenêtre entre le POST et la bascule ACTIVE se présente à
     * l'utilisateur comme un échec silencieux : il a appuyé, et le panneau
     * réaffiche « Aucune base de données pour le moment ».
     */
    const envs = readEnvironments({
      connections: [],
      databases: [{ key: 'DATABASE_URL', name: 'Development', status: 'PROVISIONING' }],
      environments: ['development'],
    });

    expect(envs).toHaveLength(1);
    expect(envs[0].status).toBe('PROVISIONING');
  });

  it('remonte la taille et le quota quand l’API les fournit', () => {
    const envs = readEnvironments({
      connections: [{ key: 'DATABASE_URL', name: 'Dev', sizeBytes: 2048, quotaBytes: 10240 }],
      environments: ['development'],
    });

    expect(envs[0].usedBytes).toBe(2048);
    expect(envs[0].quotaBytes).toBe(10240);
  });
});

describe('panneau Base de données — message d’échec de provisionnement', () => {
  it('choisit la copie « réessayer est inutile » sur le code, pas sur le texte', () => {
    /*
     * `SHARED_TENANT_UNAVAILABLE` : aucun réessai ne peut aboutir tant que la
     * plateforme n'est pas configurée. Le générique est donc un conseil FAUX.
     */
    expect(
      provisionFailureCopyKey({
        error: 'Managed database provisioning is unavailable.',
        code: 'DATABASE_PROVISION_UNAVAILABLE',
      }),
    ).toBe('databaseWorkbench.provisionUnavailable');
  });

  it('garde le générique pour tout autre échec', () => {
    expect(provisionFailureCopyKey({ error: 'boom', code: 'PANEL_REQUEST_FAILED' })).toBe(
      'databaseWorkbench.provisionFailed',
    );
  });

  it('n’affiche rien sans échec', () => {
    expect(provisionFailureCopyKey(undefined)).toBeUndefined();
    expect(provisionFailureCopyKey({})).toBeUndefined();
    expect(provisionFailureCopyKey({ error: '   ' })).toBeUndefined();
  });

  it('ne rend JAMAIS le texte brut de l’amont — il peut porter un mot de passe', () => {
    /*
     * La règle que la première version de ce correctif avait enfreinte, et que
     * le test i18n existant a rattrapée : afficher `data.error` exposait la
     * chaîne de connexion. La sortie ne peut être qu'une CLÉ de copie.
     */
    const cle = provisionFailureCopyKey({
      error: 'connect failed: postgresql://admin:hunter2@10.0.0.1/app',
      code: 'PANEL_REQUEST_FAILED',
    });

    expect(cle).toBe('databaseWorkbench.provisionFailed');
    expect(String(cle)).not.toContain('hunter2');
  });

  it('n’affiche `reason` que si elle a la forme d’une énumération', () => {
    expect(provisionFailureReason({ reason: 'SHARED_TENANT_UNAVAILABLE' })).toBe('SHARED_TENANT_UNAVAILABLE');
    expect(
      provisionFailureReason({ reason: 'postgres://user:pw@host/db' }),
      'un amont bavard reste masqué',
    ).toBeUndefined();
    expect(provisionFailureReason({})).toBeUndefined();
  });
});
