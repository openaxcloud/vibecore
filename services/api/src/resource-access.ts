/*
 * Résolution partagée des AccessGrants (IDENTITY_COLLABORATION_CONTRACT /
 * P0-EX-07) — le SEUL endroit qui décide quel rôle un grant confère sur une
 * ressource typée (PROJECT | ARTIFACT | DEPLOYMENT | DATASET).
 *
 * Sémantique (identique à projectCollaborationRole, dont la partie grants est
 * déléguée ici pour ne pas dupliquer la règle) :
 *  - résolu à CHAQUE requête, jamais mis en cache entre requêtes ;
 *  - sujet = l'utilisateur directement, OU un groupe auquel il appartient
 *    (l'appartenance est relue à chaque appel — quitter le groupe coupe) ;
 *  - un grant expiré (`expiresAt` passé) ou révoqué (`revokedAt` posé) ne
 *    confère RIEN ;
 *  - un grant d'une AUTRE organisation que celle attendue ne confère RIEN
 *    (garde cross-tenant, quand `organizationId` est fourni) ;
 *  - plusieurs chemins d'accès ⇒ le rôle le plus fort l'emporte, sauf guest
 *    qui reste en bas de l'échelle par construction.
 */

import type { AccessGrantRecord } from './store.js';

export type GrantResourceKind = 'PROJECT' | 'ARTIFACT' | 'DEPLOYMENT' | 'DATASET';

/** Sous-ensemble d'ApiStore dont la résolution a besoin (testable isolément). */
export interface ResourceAccessStore {
  listAccessGrantsForResource(resourceType: GrantResourceKind, resourceId: string): Promise<AccessGrantRecord[]>;
  listUserGroupIds(userId: string, organizationId?: string): Promise<string[]>;
}

/*
 * Strongest-first ordering used when a user reaches a resource through several
 * paths (collaborator row, direct AccessGrant, group AccessGrant). Guests sit
 * at the bottom: their scope never widens whatever else grants them access.
 */
export const PROJECT_ROLE_PRIORITY = ['owner', 'admin', 'member', 'editor', 'viewer', 'guest'];

export function strongestProjectRole(roles: string[]): string | undefined {
  return [...roles].sort(
    (a, b) =>
      (PROJECT_ROLE_PRIORITY.indexOf(a) + 1 || PROJECT_ROLE_PRIORITY.length + 1) -
      (PROJECT_ROLE_PRIORITY.indexOf(b) + 1 || PROJECT_ROLE_PRIORITY.length + 1),
  )[0];
}

/**
 * Tous les rôles que les AccessGrants ACTIFS confèrent à `userId` sur LA
 * ressource (kind, resourceId) — directs puis via groupes. Révoqué/expiré ⇒
 * exclu ; org différente de `organizationId` (si fournie) ⇒ exclu.
 */
export async function accessGrantRoles(
  store: ResourceAccessStore,
  resourceKind: GrantResourceKind,
  resourceId: string,
  userId: string,
  options?: { organizationId?: string },
): Promise<string[]> {
  const grants = await store.listAccessGrantsForResource(resourceKind, resourceId);

  const activeGrants = grants.filter(
    (grant) =>
      !grant.revokedAt &&
      !(grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) &&
      (!options?.organizationId || grant.organizationId === options.organizationId),
  );

  if (activeGrants.length === 0) {
    return [];
  }

  const roles: string[] = [];

  for (const grant of activeGrants) {
    if (grant.subjectType === 'USER' && grant.subjectUserId === userId) {
      roles.push(grant.roleKey);
    }
  }

  const groupGrants = activeGrants.filter((grant) => grant.subjectType === 'GROUP' && grant.subjectGroupId);

  if (groupGrants.length > 0) {
    const userGroupIds = new Set(await store.listUserGroupIds(userId));

    for (const grant of groupGrants) {
      if (userGroupIds.has(grant.subjectGroupId!)) {
        roles.push(grant.roleKey);
      }
    }
  }

  return roles;
}

/**
 * Le rôle (le plus fort) que les AccessGrants confèrent à `userId` sur CETTE
 * ressource — `undefined` si aucun grant actif ne le vise. Un grant sur une
 * ressource ne dit RIEN du projet parent ni des ressources sœurs : l'appelant
 * ne doit l'appliquer qu'à la ressource exacte (kind, resourceId).
 */
export async function resourceAccessRole(
  store: ResourceAccessStore,
  resourceKind: GrantResourceKind,
  resourceId: string,
  userId: string,
  options?: { organizationId?: string },
): Promise<string | undefined> {
  return strongestProjectRole(await accessGrantRoles(store, resourceKind, resourceId, userId, options));
}
