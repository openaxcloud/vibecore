---
id: BUG-AGENT-UI-005
---

## Bug

**P2 — en production, la liste d'actions d'un artefact (« Créer package.json … Terminé ») disparaît du fil dès que l'adaptateur de runtime change après le premier rendu.** Mesuré sur le portail E2E de production (run 1315, commit `fafed25`, build de production) : 7 lignes comptées, puis **0** moins de 800 ms plus tard, sans qu'aucun message ne change ; sur trois tentatives. Cause : `ProjectWorkspaceProvider` reconstruit son adaptateur quand `workspaceId` devient connu, et `workbenchStore.configureRuntime` faisait `artifacts.set({})` — l'unique chemin du code qui retire des lignes sans changement de message. Les builds de **développement** masquent le défaut : `useMessageParser` y refait un reset + une analyse complète à chaque appel (`import.meta.env.DEV`), ce que la production ne fait jamais — d'où 12/12 verts en local (dev) et rouge sur le portail (prod).

## 📤 Dispatché

☑ 04/09

## 💻 Codé

☑ 04/09 (`main`)

## ✅ Testé live

☐ à confirmer sur prod après déploiement

## Preuve

Correctif : `configureRuntime` **relie** les runners existants au nouvel adaptateur (`ActionRunner.setRuntime`) au lieu de vider le magasin ; l'effacement reste pour un changement de **projet** (`configureProject`) — et seulement vers un **autre** projet défini : le nettoyage de l'effet du fournisseur appelle `configureProject(undefined)` à chaque changement de runtime avant de relier le même projet, et un premier jet (`ebd7797`) effaçait sur ce saut, annulant le correctif sur le chemin exact qu'il visait (attrapé par un test de transition « projet → undefined → même projet », rouge sur `ebd7797`). Épinglé par `app/lib/stores/workbench.reloaded-actions.spec.ts` (bloc « un nouveau runtime relie les artefacts ») — 2 tests rouges sur le code d'origine, verts avec — et par `tests/e2e/agent-action-list-density.spec.ts`, qui nomme désormais le contenu du DOM si les lignes disparaissent.

