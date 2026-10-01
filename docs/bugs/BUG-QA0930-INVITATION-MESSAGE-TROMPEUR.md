---
id: BUG-QA0930-INVITATION-MESSAGE-TROMPEUR
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (inviter un collègue) — le collègue invité qui vient de créer son compte ne rejoint jamais
l'équipe : on lui dit « Les invitations sont temporairement indisponibles. Réessayez dans quelques
instants. »**

Mesuré le 2026-10-01 en local, vraie API, comme un utilisateur : le propriétaire invite
`collegue-…@local.test` (« Invitation créée », e-mail parti « Vous avez reçu une invitation ») ; le collègue
suit le lien → page d'acceptation dans la console (son jeton brut affiché dans un champ) → « Accepter » sans
compte → `/login?returnTo=/invitations/accept…` → inscription → retour sur l'invitation → second « Accepter »
→ message ci-dessus. La vraie réponse de l'API : **HTTP 403 `EMAIL_NOT_VERIFIED`** (« Verify your email
before accepting an invitation »). Résultat : le collègue n'a que son organisation personnelle, le projet de
l'équipe lui répond 404. Il réessaie sans fin.

Même mécanisme pour `INVITE_EMAIL_MISMATCH` (invitation acceptée depuis un autre compte) : même message
trompeur.

## Cause

`app/routes/invitations_.accept.tsx`, action : tout 403 tombait dans `errorCode: 'unavailable'`.

## 📤

☑ 01/10 PR

## 💻

☐

## ✅

☐

## Preuve

Les deux 403 ont leur message (« Vérifiez d'abord votre adresse e-mail… » ; « envoyée à une autre
adresse… »). Épinglé par `tests/e2e/invitation-adresse-non-verifiee.spec.ts` (vraie API, 2 cas) : rouge avant
(« temporairement indisponibles »), vert après ; contre-épreuve sur chaque branche → rouge.

**Décision d'Avi (2026-10-01) appliquée : l'invitation VAUT vérification de l'adresse.** À trois conditions
(sinon on ouvre un trou) :
1. l'invitation a été envoyée à CETTE adresse exacte (`INVITE_EMAIL_MISMATCH` sinon) ;
2. le lien est à usage unique ;
3. le lien est limité dans le temps (14 jours).

La vérification n'est écrite qu'APRÈS la consommation atomique du jeton (`acceptedAt` nul et `expiresAt` à
venir dans la même écriture).

Le refus `EMAIL_NOT_VERIFIED` n'existe plus à l'acceptation ; son message côté site est retiré.

Épinglé par :
- `services/api/src/tests/invitation-vaut-verification.spec.ts` — un cas par condition, chacun doit REFUSER la
  vérification ;
- `tests/e2e/invitation-adresse-non-verifiee.spec.ts` — le collègue tout juste inscrit rejoint l'équipe et son
  adresse est vérifiée ; rouge sans le correctif.

Contre-épreuves :
- adresse non comparée → la condition 1 rougit ;
- garde d'usage unique et de délai retirées → les conditions 2 et 3 rougissent.

Mesuré en les faisant : ces deux gardes sont tenues par la recherche du jeton ET par sa consommation atomique,
pas par l'endroit où la vérification est écrite (placée après la consommation par prudence en cas de requêtes
simultanées).
