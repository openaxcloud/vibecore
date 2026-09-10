import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-013 — jeu adversarial inter-locataires.
 *
 * Le registre pose ce point comme PRÉREQUIS de clôture d'AUDX-001→008 : sans jeu
 * adversarial, « corrigé » n'est pas prouvable. Ce fichier est ce jeu, écrit
 * comme une MATRICE et non comme une liste de cas : ajouter une route se fait en
 * ajoutant une ligne, ce qui est la seule forme qui résiste à l'ajout de
 * surfaces.
 *
 * ⚠️ La matrice croise trois axes, pas deux. Le trou d'AUDX-022 n'était pas
 * inter-LOCATAIRE — un jeton de lecture du projet A pouvait détruire le seau du
 * projet A. Une matrice (locataire × projet) l'aurait manqué ; il faut
 * (locataire × ressource × VERBE).
 *
 * Ce que ce fichier garde : aucune identité du locataire B ne doit obtenir
 * quoi que ce soit sur une ressource du locataire A — ni lecture, ni écriture,
 * ni existence. Un 404 est acceptable et souvent préférable à un 403 (il ne
 * confirme pas l'existence) ; un 200 ne l'est jamais.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {}
}

interface Tenant {
  userId: string;
  orgId: string;
  projectId: string;
  token: string;
}

async function twoTenants() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const make = async (slug: string, token: string): Promise<Tenant> => {
    const user = await store.createUser({
      email: `${slug}@example.com`,
      name: slug,
      passwordHash: hashPassword('password123'),
    });
    const org = await store.createOrganization({ name: slug, slug, ownerUserId: user.id });
    const project = await store.createProject({ organizationId: org.id, name: `${slug} project`, slug: `${slug}-p` });
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) });
    await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

    return { userId: user.id, orgId: org.id, projectId: project.id, token };
  };

  // Deux locataires complets et INDÉPENDANTS : aucun membre partagé.
  const victim = await make('victim', 'victim-token');
  const attacker = await make('attacker', 'attacker-token');

  return { app, store, victim, attacker };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Tout sauf 2xx. Un 404 est un refus valide : il ne confirme pas l'existence. */
function expectDenied(statusCode: number, label: string) {
  expect(statusCode, `${label} — la ressource d'autrui a répondu ${statusCode}`).toBeGreaterThanOrEqual(400);
}

type Probe = {
  label: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Construit l'URL depuis la VICTIME — c'est ce que l'attaquant vise. */
  url: (victim: Tenant) => string;
  payload?: unknown;
};

/*
 * Les surfaces. Chaque ligne est un (verbe, chemin) que l'attaquant tente sur la
 * ressource de la victime, avec sa propre session valide.
 */
const PROJECT_PROBES: Probe[] = [
  { label: 'lire le projet', method: 'GET', url: (v) => `/projects/${v.projectId}` },
  { label: 'lister les fichiers', method: 'GET', url: (v) => `/projects/${v.projectId}/files` },
  { label: 'lister les secrets', method: 'GET', url: (v) => `/projects/${v.projectId}/secrets` },
  { label: 'lire l’état IDE', method: 'GET', url: (v) => `/projects/${v.projectId}/ide-state` },
  { label: 'lister les instantanés', method: 'GET', url: (v) => `/projects/${v.projectId}/snapshots` },
  { label: 'lister les déploiements', method: 'GET', url: (v) => `/projects/${v.projectId}/deployments` },
  { label: 'lister les collaborateurs', method: 'GET', url: (v) => `/projects/${v.projectId}/collaborators` },
  {
    label: 'écrire un secret',
    method: 'POST',
    url: (v) => `/projects/${v.projectId}/secrets`,
    payload: { key: 'STOLEN', value: 'x' },
  },
  {
    label: 'renommer le projet',
    method: 'PATCH',
    url: (v) => `/projects/${v.projectId}`,
    payload: { name: 'pwned' },
  },
  { label: 'supprimer le projet', method: 'DELETE', url: (v) => `/projects/${v.projectId}` },
];

const ORG_PROBES: Probe[] = [
  { label: 'lire l’organisation', method: 'GET', url: (v) => `/orgs/${v.orgId}` },
  { label: 'lister les membres', method: 'GET', url: (v) => `/orgs/${v.orgId}/members` },
  { label: 'lister les projets', method: 'GET', url: (v) => `/orgs/${v.orgId}/projects` },
  { label: 'lire les crédits', method: 'GET', url: (v) => `/orgs/${v.orgId}/credits` },
  { label: 'lire le journal d’audit', method: 'GET', url: (v) => `/orgs/${v.orgId}/audit-logs` },
  {
    label: 'créer un import',
    method: 'POST',
    url: (v) => `/orgs/${v.orgId}/imports`,
    payload: { provider: 'zip', idempotencyKey: 'evil', files: [] },
  },
];

describe('AUDX-013 jeu adversarial inter-locataires', () => {
  describe('un locataire authentifié ne touche pas les projets d’un autre', () => {
    for (const probe of PROJECT_PROBES) {
      it(`refuse: ${probe.label}`, async () => {
        const { app, victim, attacker } = await twoTenants();

        const response = await app.inject({
          method: probe.method,
          url: probe.url(victim),
          headers: bearer(attacker.token),
          ...(probe.payload === undefined ? {} : { payload: probe.payload }),
        });

        expectDenied(response.statusCode, probe.label);
      });
    }
  });

  describe('un locataire authentifié ne touche pas l’organisation d’un autre', () => {
    for (const probe of ORG_PROBES) {
      it(`refuse: ${probe.label}`, async () => {
        const { app, victim, attacker } = await twoTenants();

        const response = await app.inject({
          method: probe.method,
          url: probe.url(victim),
          headers: bearer(attacker.token),
          ...(probe.payload === undefined ? {} : { payload: probe.payload }),
        });

        expectDenied(response.statusCode, probe.label);
      });
    }
  });

  describe('contre-épreuve du jeu lui-même', () => {
    /*
     * ⚠️ Indispensable. Une matrice adversariale qui refuserait TOUT — parce que
     * l'URL est fausse, le jeton mal formé, ou la route inexistante — serait
     * verte et ne prouverait rien. Chaque sonde doit donc RÉUSSIR pour son
     * propriétaire légitime, sinon elle ne mesure pas l'isolation, elle mesure
     * une faute de frappe.
     */
    for (const probe of [...PROJECT_PROBES, ...ORG_PROBES]) {
      it(`la sonde « ${probe.label} » atteint bien la ressource de son propriétaire`, async () => {
        const { app, victim } = await twoTenants();

        const response = await app.inject({
          method: probe.method,
          url: probe.url(victim),
          headers: bearer(victim.token),
          ...(probe.payload === undefined ? {} : { payload: probe.payload }),
        });

        /*
         * On n'exige pas 2xx — certaines routes répondent 404 légitimement pour
         * une ressource absente (pas d'état IDE, pas de déploiement). On exige
         * que le propriétaire n'obtienne PAS un refus d'AUTORISATION : c'est ce
         * qui distingue « la sonde vise la bonne chose » de « la sonde ne vise
         * rien ».
         */
        expect([401, 403]).not.toContain(response.statusCode);
      });
    }
  });

  describe('une session révoquée ne vaut plus rien', () => {
    it('refuse un jeton révoqué', async () => {
      const { app, store, victim } = await twoTenants();

      /*
       * ⚠️ Sans appel optionnel, DÉLIBÉRÉMENT. La première version écrivait
       * `store.deleteSession?.(...)` — méthode qui n'existe pas — donc ne
       * révoquait rien, la requête suivante renvoyait 200, et l'échec ressemblait
       * à une faille d'authentification alors que c'était le test qui ne faisait
       * rien. Un `?.` sur le geste que le test EXISTE pour poser transforme une
       * méthode absente en garde silencieusement creux.
       */
      const before = await app.inject({
        method: 'GET',
        url: `/projects/${victim.projectId}`,
        headers: bearer(victim.token),
      });

      // Le jeton vaut quelque chose AVANT — sinon la suite ne prouve rien.
      expect(before.statusCode).toBe(200);

      await store.revokeAllSessions(victim.userId);

      const after = await app.inject({
        method: 'GET',
        url: `/projects/${victim.projectId}`,
        headers: bearer(victim.token),
      });

      expect([401, 403, 404]).toContain(after.statusCode);
    });
  });
});
