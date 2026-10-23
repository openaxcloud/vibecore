---
id: BUG-SECURITY-SCAN-OPERATION-001
---

# Security : une ancienne opération écrase l’état du scan relancé

## 📤 Dispatché

23 octobre 2026. Suivi local distinct de #777, basé sur `4b06e77e7c42409ffbb5bffe5503933e8f67065e`. Préparé localement avant intégration du parent ; aucun contenu #768/#764 ni commande sur un projet utilisateur.

## 💻 Codé

Le timer, la réponse et le catch du scan vérifient l’identité du contrôleur courant avant de modifier l’état. Annulation et démontage invalident cette identité. Le finally ne retire que son propre contrôleur. Le budget de 90 secondes et les assertions sont inchangés ; aucune modification des scans serveur ou permissions.

## ✅ Testé live

Pas de nouvelle recette navigateur ou scanner réel revendiquée. Le test `app/components/chat/security-scan-operation.spec.ts` extrait par AST les vrais callbacks de ProjectSecurityPanel et exécute leur code avec promesses réseau différées, état contrôlé et horloge Vitest.

Six cas ciblés : rejet ancien pendant relance, rejet ancien après nouvelle completion, timer ancien pendant relance, completion tardive après timeout, annulation sans transport terminé avant échéance, rejet abort après timeout. Sur la source parent exacte : quatre échecs et deux succès. Sur la correction : six succès, sans retry ni omission. Les deux cas timeout déjà verts ne sont pas présentés comme nouveaux défauts corrigés.

Reproduction rouge : exporter BaseChat de la base puis lancer le test avec SECURITY_SCAN_CLIENT_SOURCE pointant sur cet export. Recette verte : même test sans cette variable. Rapports locaux conservés dans `/workspace/ux-artifacts/security-scan-operation/` (red-final.log, green-final.log). Cette preuve contrôlée établit la course des callbacks, pas sa fréquence réelle dans un navigateur. CI/revue de la future combinaison restent nécessaires ; aucun déploiement.

## Intégration du parent

Après fusion de #777, main `c988c2af60d058971afe72f057c6fa82a178fb21` est intégré sans conflit à la branche du correctif. Les six tests ciblés sont rejoués sur cette combinaison : six succès, zéro retry et zéro omission. Le diff par rapport à ce main reste limité aux gardes d’identité dans BaseChat, au test dédié, à cette fiche et à son entrée d’inventaire. Les preuves rouges historiques restent applicables à la source parent testée ; elles ne sont pas remplacées par les résultats de la combinaison. Pas de nouvelle recette navigateur ni scanner réel, ni suite locale exhaustive.
