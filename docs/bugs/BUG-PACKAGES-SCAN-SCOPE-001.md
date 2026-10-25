---
id: BUG-PACKAGES-SCAN-SCOPE-001
section: "IDE — exécution réelle"
---

# Diagnostics Packages masqués et constats effacés par un scan partiel

## 📤 Dispatché

25 octobre 2026. Lot distinct après #781, basé sur son merge main `d3adf5be9`. Git, Publish/Déploiement, Domains, moteur Debugger et restauration réservés aux autres sessions ; aucune de leurs sections modifiée.

## 💻 Codé

Correctif local, pas encore fusionné. Packages ne neutralise plus les erreurs audit/outdated avec `|| true`. Un rapport npm valide peut réussir avec code 1 (findings/outdated) tout en conservant ce code brut dans l’historique. Installation reste stricte. Yarn choisit sa commande Classic/Berry après lecture de version ; aucune seconde commande n’est lancée en réaction à un échec d’audit.

Security remplace seulement les constats de sources réellement scannées avec succès et complètement. Les autres sources et les annotations utilisateur restent conservées. La collecte grep indique complet/tronqué ; une sortie tronquée ou sans marqueur de complétude produit failed/422, sans annoncer un scan complet. Les identités SAST utilisent le contenu complet, pas un préfixe qui pouvait faire hériter à tort d’un ancien « ignoré ».

## ✅ Testé live

Non. Tests locaux sur fichiers synthétiques et handlers avec transport contrôlé. Aucun fournisseur, donnée utilisateur, secret ou ressource créé ; aucune recette production, publication, mobile ou Safari revendiquée.

## Preuves et limites

[Validation du lot](package-scan-residuals-2026-10-25/VALIDATION.md). Les rapports non nuls pnpm/Yarn/Bun restent des échecs explicites, faute de contrat de sortie validé ici ; ils ne sont pas interprétés comme un audit sans vulnérabilité. Le scanner garde ses limites 50/80 lignes et 64 Kio, désormais signalées comme couverture incomplète. La conservation d’un constat déjà classé fixed/ignored n’est pas une nouvelle preuve d’absence du risque.
