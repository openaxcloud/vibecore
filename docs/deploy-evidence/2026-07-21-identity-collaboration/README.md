# Identité & collaboration (P0-EX-07) — Group / Guest / AccessGrant prouvés (2026-07-21)

Refus expert levé : « Group, Guest, AccessGrant non implémentés »
(`docs/parity/IDENTITY_COLLABORATION_CONTRACT.md`, plan §5.1 :
User → Workspace → Membership / Group / GuestGrant / Project →
ProjectAccessGrant — « Workspace » du contrat = notre `Organization`).
État : **PROVEN_REVIEW_PENDING** — rien de CLOSED.

## Ce qui est réutilisé (GREP d'abord, pas de doublon)

- `OrganizationMember` (+ nouveaux champs contrat `state`/`invitedByUserId`/`joinedAt`),
  `Role`/`RolePermission`/`CustomRole`, `requireOrg`/`requireProject` (enforcement
  serveur existant), `ProjectCollaborator` (grants user directs à expiry),
  `ProjectShareLink` (invité par lien). Rien de tout ça n'est dupliqué.

## Ce qui manquait — maintenant implémenté (migration `0080_identity_collaboration`)

- **`Group` / `GroupMember`** : groupes d'organisation, `scimManaged` ⇒ toute
  édition manuelle refusée (`GROUP_SCIM_MANAGED`, 409) — le SCIM est la seule
  source (invariant contrat §4).
- **`ResourceAccessGrant`** : le AccessGrant générique du contrat — sujet
  `USER|GROUP`, ressource typée `PROJECT|ARTIFACT|DEPLOYMENT|DATASET`,
  `roleKey`, `expiresAt`, **`grantedByUserId` / `revokedAt` / `revokedByUserId`**
  (expiration + chemin de révocation + audit exigés par le contrat).
- **Rôle `guest`** (`@vibecore/rbac`) : la portée la plus étroite —
  `projects:read`+`workspaces:read` seulement, PAS de `org:read` (un invité
  n'énumère pas le workspace) ; read-only par construction
  (`isReadOnlyProjectRole`).
- **Enforcement 100 % serveur** dans `requireProject → projectCollaborationRole`
  (`app.ts`) : les grants (directs + via groupes) sont résolus côté serveur à
  CHAQUE requête projet ; expirés et révoqués ⇒ RIEN ; élévation par grant
  bornée à la permission réellement portée par le rôle accordé et à SA
  ressource seulement ; un outsider ne peut recevoir que `guest`/`viewer`
  (`GRANT_OUTSIDER_ROLE_TOO_WIDE`).
- **Routes** : `/orgs/:orgId/groups*` et `/projects/:projectId/access-grants*`,
  gérées sous `members:manage` (la même règle que les collaborateurs : un
  invité ne peut pas élargir l'ACL qui l'a admis) ; tout est audité.

## Preuves

### 15/15 specs vitest (négatifs d'abord), dont zéro régression
`identity-collaboration.spec.ts` (8) + `project-collaborator-roles.spec.ts`
(7 préexistants, inchangés — la sémantique « viewer ne peut pas écrire » tient).

### Rejoué contre le VRAI store Prisma + vrai Postgres (`proof-run.jsonl`)
Harness committé `src/tests/identity-collaboration-live-proof.ts`
(`LIVE_PROOF=1`, DB `identity_proof`, migrations 0001→0080 réellement
appliquées). Cinq négatifs, chacun = appels HTTP réels sur `buildApiApp` +
lignes DB réelles :

| # | Négatif (contrat) | Observé |
|---|---|---|
| N1 | Invité hors de sa portée | lecture projet accordé **200** ; écriture **403 `PROJECT_ROLE_READ_ONLY`** ; autre projet **404** ; auto-élévation refusée |
| N2 | Grant expiré | **404** (ne confère rien) |
| N3 | **Permission retirée** | **200 avant → révocation → même appel 404 après** ; ligne DB : `revokedAt` + `revokedByUserId` posés |
| N4 | Groupe SCIM-managed édité à la main | **409 `GROUP_SCIM_MANAGED`** |
| N5 | Cross-tenant | groupes **404**, projet **404** |

Chemin positif prouvé aussi (specs) : grant de GROUPE `editor` → un membre org
`viewer` peut écrire CE projet ; il quitte le groupe → **403** immédiat.

## Décision de sémantique (consignée)

Un `ResourceAccessGrant` **élève** l'accès d'un membre d'org sur SA ressource
(ex. org `viewer` + grant `editor` sur le projet X ⇒ écrit X, rien d'autre),
borné aux permissions du rôle accordé. La sémantique inverse préexistante est
conservée : un rôle par-projet read-only (viewer/guest) plafonne TOUJOURS
l'écriture, quel que soit le rôle org (spec préexistante verte).

## Pas fait (honnête)

- **SCIM Groups côté connecteur** (P123/P131) : le modèle + l'invariant
  d'édition sont là ; le sync SCIM lui-même (provisioning depuis l'IdP) n'est
  pas câblé.
- Grants sur `ARTIFACT|DEPLOYMENT|DATASET` : modèle + store prêts, enforcement
  câblé pour `PROJECT` seulement (les autres ressources n'ont pas encore de
  chemin de lecture unifié à garder).
- Pas d'UI ; pas déployé (pas de merge) ; `Identity.kind`
  (PLATFORM_USER/PUBLISHED_APP/APP_END_USER §10.3) non porté sur `User` —
  UNKNOWN à trancher.

## Reproduire

```bash
docker exec vibecore-postgres-1 psql -U vibecore -c "CREATE DATABASE identity_proof;"
DATABASE_URL=postgresql://…/identity_proof npx prisma migrate deploy   # packages/database
LIVE_PROOF=1 DATABASE_URL=postgresql://…/identity_proof \
  tsx services/api/src/tests/identity-collaboration-live-proof.ts
```
