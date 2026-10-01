---
id: BUG-QA1001-JARGON-DANS-LES-MESSAGES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Des messages qu'un client peut lire contiennent du vocabulaire de développeur.** Relevé en production le
2026-10-01 par la session livraisons, sur le correctif de l'inscription : « Une organisation portant ce nom ou ce
slug existe déjà. »

Même relecture sur les messages de l'API qu'un client voit (inscription, adresses de projet et de galerie,
connexion Google/GitHub, journaux de publication) : 19 messages concernés. Exemples :
- « État OAuth invalide ou expiré » ;
- « La réponse du jeton OAuth ne contient aucun jeton d'accès » ;
- « compilation dans le pod (cwd …) » ;
- « contexte gs://bucket/… » ;
- « ownerRepo doit être un slug GitHub… » ;
- « GitHub a renvoyé le statut HTTP 403 ».

Les messages destinés aux ADMINISTRATEURS (configuration SSO/SCIM, secrets de webhook) et ceux échangés entre
serveurs gardent leur vocabulaire, juste pour eux. Côté site, les termes restants sont du vocabulaire attendu
par leur public : « JSON » pour des formats d'export, « webhook » et « bucket » dans l'IDE d'un développeur.

## 📤

☑ 01/10 branche `fix/messages-sans-jargon`

## 💻

☐

## ✅

☐

## Preuve

Les 19 messages ont été réécrits en EN/FR. Exemples :
- « Ce nom est déjà utilisé. Choisissez-en un autre. » ;
- « Ce lien de connexion a expiré. Recommencez la connexion. ».

Les mêmes textes ont été corrigés dans les pages de connexion (`transactional-i18n.json`).

Deux écritures EN DUR ont été remplacées par la clé du catalogue : le journal de compilation et le magasin de
test. Sans cela, la ligne du journal n'aurait plus été traduite à la lecture.

Épinglé par `services/api/src/tests/messages-client-sans-jargon.spec.ts` : chaque message lu par un client,
dans les deux langues, est confronté à un vocabulaire de développeur.
- Contre-épreuve : avec les messages de `main`, 39 cas sur 43 rougissent.
- API complète : 2 237 tests verts.
