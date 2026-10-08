---
id: BUG-DEPLOY-ROLLOUT-EVIDENCE-001
---

## Bug

P1 — un rollout atomique en échec ne conserve aucun état des pods et Jobs dans les artefacts du pipeline. Le déploiement `37683775662` du commit `74aab77b7f71e513be61c19f5fe4b6223cff1200` a passé les portes CI/E2E, la construction et le scan des images, puis échoué à l'étape Helm le 07/10/2026. Le connecteur échoue à lire le journal détaillé (`Transport closed`). Les annotations publiques ne donnent que le code de sortie 1 et des avertissements de dérive des ressources ; elles ne permettent pas de conclure à une cause précise du rollout.

## 📤 Dispatché

📤 Pris en charge le 08/10/2026.

## 💻 Codé

☐ En validation sur branche. Le déploiement conserve des snapshots JSONL des états Kubernetes avant, pendant et après Helm, y compris avant son rollback atomique. Le code de sortie et les sorties standard de Helm sont conservés. L'artefact est envoyé même en échec. La collecte ne persiste ni specs, ni variables d'environnement, ni annotations, ni Secrets, ni journaux applicatifs, ni messages Kubernetes arbitraires. Les erreurs de collecte sont explicites.

## ✅ Testé live

☐ Non confirmé. Le prochain pipeline doit produire `rollout-status-<sha>` ; lire les snapshots précédant le rollback pour déterminer la cause réelle. Ce changement améliore les preuves ; il ne constitue pas un correctif attesté de la panne Helm.

## Validation locale

Six tests Python hermétiques couvrent les états de migration et init containers, l'exclusion de données confidentielles, les erreurs de collecte, les vrais codes de sortie de trois sous-processus, la disparition des pods au rollback et l'intégration au workflow. Les portes de politique de signature et de livraison par SHA exact restent vertes.
