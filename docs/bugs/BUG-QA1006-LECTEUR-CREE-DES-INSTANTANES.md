---
id: BUG-QA1006-LECTEUR-CREE-DES-INSTANTANES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Mineur — un membre en LECTURE SEULE (`viewer`) peut créer des instantanés d'un projet par l'outil
`create_snapshot` de `POST /projects/:id/ai/tools/:toolName`.**

### Balayage (2026-10-06, `main` 682dfb6e8, vraie API, store de test, vrai stockage disque)

Les 91 routes d'écriture sous `/projects/:projectId` ont été appelées avec le jeton d'un vrai lecteur (invité,
puis invitation acceptée). Contrôle positif : le même lecteur LIT le projet (200).
- 70 refus (403) et 12 introuvables (404) ;
- 2 réponses 200 sans écriture : retrait de SA présence, lecture de quota ;
- 7 réponses 400 : la validation passe AVANT le contrôle des droits. Relu une à une dans le code : `scheduled-tasks`
  et `deployments/:id/access` exigent bien `projects:write` ; les commentaires sont ouverts aux lecteurs (choix
  produit) ; `ai/tools/:toolName` délègue à `executeAiTool`, qui exige `workspaces:write` pour les outils qui
  écrivent.

Sur les 17 outils, `create_snapshot` est le seul qui écrit sans figurer dans cette liste. Mesuré : pour le
lecteur, `write_file` → 403 `RBAC_FORBIDDEN`, `create_snapshot` → la garde laisse passer (502 du gestionnaire
d'espaces, absent du banc).

### Repro

`services/api/src/tests/lecteur-sans-instantane.spec.ts`.

## Correctif

`create_snapshot` rejoint la liste des outils qui exigent `workspaces:write`. Seul `viewer` est touché :
`owner`, `admin`, `member` et `editor` ont `workspaces:write`.

Épinglé par `services/api/src/tests/lecteur-sans-instantane.spec.ts`. Contre-épreuves : correctif retiré → le
cas du lecteur rougit (502 au lieu de 403) ; l'éditeur crée toujours ses instantanés et le lecteur garde ses
outils de lecture. Suite API complète : 2 239 réussis, 0 échec.

## 📤

☑ session balayage, 2026-10-06

## 💻

☑ codé, en cours de preuve — branche `fix/lecteur-sans-instantane`, non fusionnée

## ✅

☐

## Preuve

Épinglé par `services/api/src/tests/lecteur-sans-instantane.spec.ts`. Preuve en production : demande un compte
lecteur, non disponible.
