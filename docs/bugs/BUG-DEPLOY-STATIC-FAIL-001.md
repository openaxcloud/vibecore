---
id: BUG-DEPLOY-STATIC-FAIL-001
---

## Bug

**P1 — Export statique « Aperçu » en Échec** (capture 06/09 14:09, projet « Certif Finale », Vite + React). Cause NON mesurée : les journaux du déploiement (onglet Journaux) n'ont pas été fournis. Pistes lues dans le code : le build tourne dans une copie `.vibecore-deploy-<id>` sans `node_modules` puis `npm install --include=dev` ; un `@vitejs/plugin-react` absent de `package.json` (présent seulement dans le `node_modules` vivant) ou un `esbuild` dont le `postinstall` est bloqué (« npm warn install-scripts … allowScripts ») feraient échouer `vite build`. **RECONFIRMÉ LE 09/09 11:04 par Avi, sur un AUTRE projet** (« Carnet de recettes ») : « impossible de déployer en réel, aucun fournisseur ne fonctionne ». Ce n'est donc pas propre à un projet — c'est le chemin de déploiement lui-même. L'écran montre « Export statique · Aperçu » en Échec, avec Redéployer / Restauration / Annuler.

## 📤 Dispatché

☐

## 💻 Codé

🟡 09/09 — **LA CAUSE RACINE RESTE INCONNUE** (il me faut l'onglet Journaux d'un déploiement échoué ; la production est injoignable d'ici, la passerelle refuse le CONNECT vers `app.e-code.ai:443`). MAIS un défaut RÉEL et distinct a été trouvé et corrigé en chemin : la carte de « Gérer » affichait « Échec » et **rien d'autre** — pour savoir pourquoi, il fallait deviner qu'un onglet « Journaux » existe. Or la cause voyage DÉJÀ avec l'enregistrement (les journaux sont dans la charge utile) et le pipeline y écrit des codes précis (`INSTALL_FAILED`, `BUILD_FAILED`, `PACKAGE_JSON_MISSING`, `BUILD_TIMEOUT`…). Elle est maintenant affichée sous la pastille, en monospace, sans troncature. Écarté au passage : le squelette que NOUS générons déclare bien `vite`, `@vitejs/plugin-react`, `react` et `react-dom` en dépendances — ce n'est donc pas lui.

## ✅ Testé live

☐ live iPhone

## Preuve

épinglé par `app/components/deploy/publication.spec.ts` (`causeDeLEchec` : dernière erreur, repli sur le code, et rien d'inventé quand le journal est muet). ⚠️ Le point reste 🟡 : afficher la cause n'est pas la corriger. **SUITE DU 09/09 — UNE MOITIÉ DU BROUILLARD LEVÉE, et elle explique le « rien d'autre ».** Le build statique ne tourne QUE dans le pod de l'espace de travail, et le point de couture qui le lance avait **CINQ** sorties d'abandon distinctes rendant toutes le même `{ handled: false }` nu : pas de contexte utilisateur, pas de `WebSocket` dans l'exécution, espace de travail injoignable, jeton d'agent indisponible, appel du build qui lève. L'appelant repliait les cinq sur UN seul message, `DEPLOY_WORKSPACE_UNREACHABLE` — or quatre d'entre elles n'ont rien à voir avec un pod injoignable. **Et trois avalaient l'erreur dans un `catch {}` nu** : la seule phrase qui disait ce qui s'était passé était jetée avant d'être lue (règle 13). Un déploiement pouvait donc échouer pour un jeton non délivré et l'annoncer comme un pod qui démarre. Chaque abandon porte maintenant son CODE, et le détail LAVÉ de l'erreur attrapée, dans le journal du déploiement. **Lavé, parce qu'une erreur d'infrastructure transporte des URL et qu'une URL transporte parfois un jeton** (règle 12) : chaîne de requête effacée, `Bearer` effacé, toute suite de 24 caractères ou plus de l'alphabet des jetons effacée — et le test le vérifie par l'ABSENCE, jamais par la présence. Contre-épreuve dans les deux sens (code retiré de la ligne de journal → 2 rouges ; `catch` remis nu → 2 rouges). épinglé par `services/api/src/tests/deploy-refus.spec.ts` (lavage + garde de source : aucun abandon muet, aucun `catch` muet qui décide d'un abandon) et `services/api/src/tests/deploy-workspace-only.spec.ts` (bout en bout : le code d'abandon arrive dans le journal, le jeton n'y arrive pas)

