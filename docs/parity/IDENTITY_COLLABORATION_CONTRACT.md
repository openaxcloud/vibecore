# IDENTITY_COLLABORATION_CONTRACT — identité, workspaces, collaboration (P0-EX-07)

schemaVersion: 1
repoCommit: d56931bd
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: Group/Guest/AccessGrant non implémentés (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — Group/Guest/AccessGrant non implémentés — puis re-soumettre à signature

## 1. Entités de domaine

```
Identity { identityId, kind ∈ { PLATFORM_USER, PUBLISHED_APP, APP_END_USER }, authProviderRefs[] }
Workspace { workspaceId, ownerBoundary, kind ∈ { PERSONAL, ORGANIZATION } }
Membership { workspaceId, identityId, role ∈ { ADMIN, MEMBER, GUEST, VIEWER }, state, invitedBy, joinedAt }
Group { groupId, workspaceId, name, memberIds[], scimManaged }
Guest { via ShareLink ou Membership(role=GUEST) — jamais d'entité fantôme }
AccessGrant { grantId, subject (identity|group), resource (project|artifact|deployment|dataset),
  scope, expiresAt, grantedBy, revocation }
```

## 2. Invariants

1. Les trois identités (plateforme / app publiée / utilisateurs finaux) ne se
   croisent JAMAIS implicitement (§10.3 du plan).
2. Toute permission est vérifiée serveur ; rien d'appliqué uniquement client
   (§16.2).
3. Un transfert d'ownership révoque puis ré-accorde — ne renomme pas (§13.2).
4. Groups : source SCIM quand scimManaged=true — aucune édition manuelle.
5. Chaque AccessGrant porte expiration + chemin de révocation + audit.

## 3. État réel mesuré (IMPLEMENTATION_STATUS)

Orgs/memberships/collaborateurs/share-links : CODED (P121/P122/P124) ;
Groups et SCIM Groups : NOT_STARTED (P123/P131) ; audit logs : CODED (P132).

## 4. Tests négatifs exigés

Accès cross-tenant refusé ; grant expiré refusé ; guest hors scope refusé ;
édition manuelle d'un groupe SCIM refusée.
