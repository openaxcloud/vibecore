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

**Reste ouvert — décision d'Avi** : accepter une invitation reçue sur l'adresse X pourrait valoir
vérification de X (c'est la preuve qu'on lit cette boîte) ; sinon le collègue doit d'abord ouvrir l'e-mail de
vérification, puis retrouver l'invitation.
