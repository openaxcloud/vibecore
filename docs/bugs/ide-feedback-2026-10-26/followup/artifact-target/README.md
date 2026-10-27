# Validation du delta Artifact appliqué localement

Worktree /workspace/vibecore-ui-ide-local-recovery, base fa85f32d. Deux propriétés y retirées dans actionVariants de Artifact.tsx par parent ; aucun autre changement produit de cet agent. Têtes807 et next non modifiées.

17 tests existants /4suites verts : Artifact.density, Artifact.demarrage, Artifact.i18n, styles/agent-action-list-density. Vérifications de densité/cible44/démarrage réel via handler/i18n conservées. Aucun seuil changé ni assertion affaiblie. ESLint Artifact et Prettier exit0. Build/typage intégrés coordonnés par parent, non revendiqués ici.

Navigateur local : prepare.cjs extrait le vrai ActionList de la source APPLIQUÉE et ne remplace plus les variants dans le harness. React/FramerMotion et CSS807 réels (CSS inchangée par ce delta). Actions/fond/adaptateur ouverture synthétiques ; aucun backend réel.

1296 mesures :320/390/768 ×motion reduce/no-preference ×12montages×18frames, zéro cible<44 et aucune translation. Fondu0→1 toujours observé. Trois parcours dynamiques7→8actions, changement running/failed, nœud existant et handler ouverture conservés, toutes cibles>=44. before diagnostic exact43.999969 conservé séparément /tmp/ui-artifact-target-diagnostic.

Scripts : node prepare.cjs ; node server.cjs ; node after.cjs ; node dynamic.cjs. Logs/reçus after.json,dynamic.json,unit.txt,lint.txt,format.txt ; source-hashes.json identifie source et E2E strict intact. Aucun nouveau test miroir des variants ajouté : la recette comportementale mesure le rendu pendant son animation.

Limites : renderer isoléChromium local ; pas de relance CI agent-action-list-density intégrale, pas de build application, Safari/Firefox/production. Ne prouve pas d’absence de transformations provenant de tous les ancêtres possibles. Fondu en mode reduce conservé, sans prétendre supprimer toutes animations. Navigateurs fermés ; cleanup.json prouve serveur propre disparu. Aucun commit/push/index par cet agent.

## Intégration locale contrôlée par la session principale

Build client/SSR complet réussi, log `/tmp/ui-ide-local-recovery-build.log`. Première commande `tsc -p tsconfig.json` interrompue134 par limite de tas Node4GiB (aucun diagnostic TypeScript produit) ; contrôle web avec `tsconfig.web.json`, utilisé par scripts/typecheck.mjs, réussi (exit0, aucun diagnostic) avec tas6GiB. Gitleaks staged : aucune fuite détectée. Revue indépendante GO limité au delta et aux preuves. Aucun changement de seuil E2E. Screenshot après inspecté ; cadre de mesure artificiel, pas capture du panneau IDE complet. Le complément fa85f32d et la tête807 restent intacts. Aucun index commun régénéré et aucune publication.
