---
id: BUG-QA0930-INVITATION-SANS-PLACE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (inviter un collègue) — une équipe au forfait gratuit (ou Pro) envoie des invitations que
personne ne pourra jamais accepter. Le collègue fait tout le parcours, puis lit « Trop de tentatives ont été
effectuées. Patientez un instant, puis réessayez. »**

Mesuré le 2026-10-01 vers 07:40 en local, vraie API, comme un utilisateur :

1. le propriétaire (équipe créée à l'inscription, forfait gratuit) invite `collegue-…@local.test` →
   **201**, « Invitation envoyée », e-mail parti ;
2. le collègue ouvre le lien sans compte → « Accepter » → connexion → inscription (la destination est bien
   gardée) → retour sur l'invitation ;
3. il vérifie son adresse → **200** `{"verified":true}` ;
4. il accepte → **429** `{"error":"Quota exceeded for team.members","code":"QUOTA_EXCEEDED"}` ; la page
   affiche le message du LIMITEUR DE DÉBIT, « Trop de tentatives… réessayez ».

Réessayer ne change rien : le forfait gratuit a **une** place (`team.members: 1`,
`packages/billing/src/index.ts`), celle du propriétaire. L'invitation était impossible à honorer dès sa
création.

⚠️ **Le forfait Pro a lui aussi une seule place** (`team.members: 1`). Un client Pro payant ne peut donc
inviter personne ; seul Team (25 places) le permet. Ce n'est pas corrigé ici (c'est la grille de forfaits,
décision d'Avi) — mais avec ce correctif, il l'apprend au moment d'inviter, pas son collègue après
inscription.

## Cause

Deux défauts, même parcours :

- `services/api/src/app.ts`, `POST /orgs/:orgId/invitations` : l'acceptation consomme une place
  (`ensureQuota(team.members)`), la création ne la consultait pas ;
- les quatre formulaires d'invitation lisaient le 429 au seul STATUT, donc comme le limiteur de débit :
  `/invitations/accept` et `/invitations` → « trop de tentatives » ; `/organization-members` (lien « Équipe »
  de la barre latérale) → « Impossible d'envoyer l'invitation » ; `/organization-invitations` → refus
  générique en français, texte anglais brut de l'API en anglais.

## 📤

☑ 01/10 PR (#650, même parcours et mêmes fichiers)

## 💻

☐

## ✅

☐

## Preuve

- API : la création refuse (429 `QUOTA_EXCEEDED`, `quotaKey: team.members`, message `TEAM_SEAT_LIMIT`) quand
  le forfait n'a plus de place, en comptant les places déjà promises aux invitations en attente ; rien n'est
  créé, aucun e-mail. Épinglé par `services/api/src/tests/invitation-places-du-forfait.spec.ts` (3 cas dont
  un témoin Team) : rouge avant (201), vert après. `api.spec.ts` « enforces team member quota across
  invitation acceptance » garde la limite à l'acceptation (invitation créée avec de la place, puis équipe
  repassée en gratuit → 429).
- Site : une seule fonction lit le CODE (`app/lib/refus-place-equipe.server.ts`) ; les quatre formulaires
  disent la vraie cause. Épinglé par `app/routes/invitation-sans-place.spec.ts` (vraies actions de route
  contre un vrai serveur HTTP ; contre-épreuve : fonction neutralisée → 4 rouges, témoin « limiteur » vert).
- Parcours réel : `tests/e2e/invitation-sans-place.spec.ts` (2 cas, page Équipe et acceptation) — rouge
  avant correctif (message introuvable), vert après.
