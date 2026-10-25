---
id: BUG-PANEL-EXECUTION-EVIDENCE-001
section: "IDE — exécution réelle"
---

# Codes absents et erreurs de scanner transformés en succès

## 📤 Dispatché

25 octobre 2026, reprise après #776–780 depuis main `941d7d7fc`. Périmètres scanner, inventaire et revue indépendante séparés ; restauration et moteur Debugger exclus.

## 💻 Codé

Correctif local, pas encore fusionné. Terminal, Packages et Workflows exigent un code de sortie explicite égal à zéro. Un code absent/invalide est stocké comme inconnu (-1), jamais comme succès. Packages conserve aussi le signal success=false.

Security exécute npm audit sans `|| true` : exit 1 n’est accepté que pour un rapport npm v2 valide, permettant de garder les vulnérabilités tout en refusant une panne. Les scans grep distinguent aucun résultat (1) des erreurs (>1), drainent la sortie et ne conservent qu’un préfixe borné (50/80 lignes et 64 Kio). Aucun fichier temporaire de secrets. Aucun sous-scan actif produit failed au lieu de completed. Les anciens constats sont conservés si le scan échoue.

## ✅ Testé live

Non. Commandes grep réelles sur fichiers temporaires synthétiques et contrats BFF avec exécuteur contrôlé ; aucun projet client, fournisseur, compte ni credential utilisé. Pas de recette production, de Safari ni de parcours création→publication complet.

## Preuves et limites

Voir [inventaire et matrice](panel-execution-2026-10-25/INVENTORY.md) et le relevé de validation joint à la PR. Les commandes audit/outdated du panneau Packages gardent leurs `|| true` historiques, hors scanner Security. Les profils de scan partiels peuvent remplacer les constats des autres sources (comportement préexistant à traiter séparément). Sync, transport webhook, auth des clés et event streams restent incomplets ; ce lot ne les masque pas et ne les revendique pas fonctionnels.
