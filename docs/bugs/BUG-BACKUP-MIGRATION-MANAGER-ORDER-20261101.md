---
id: BUG-BACKUP-MIGRATION-MANAGER-ORDER-20261101
---

# Ordre migration, manager, API pour la provenance des backups

📤 Dispatché : ☑ — préserver la migration additive avant le manager prêt, puis l’API.

💻 Codé : ☐ — correction locale, non publiée.

✅ Testé live : ☐ — aucun déploiement ou backup réel.

Le hook existant utilisait nécessairement l’image de l’API déployée et les
Deployments roulaient ensuite ensemble. Une nouvelle API face à l’ancien manager
refuse sûrement les backups, mais peut rendre503 ou faire échouer un publish avant
DDL ; la disponibilité de ces opérations n’était pas préservée pendant le rollout.

Un digest de migration indépendant permet désormais une passe préparatoire :
hook nouvelle image, API ancienne inchangée, puis manager. La barrière vérifie le
rollout, les générations, les réplicas prêts et les imageIDs. L’upgrade final efface
l’override du hook et conserve les barrières SEC8. Tout échec après début de la
première mutation utilise la révision initiale, jamais seulement l’intermédiaire.
Aucune permission, secret, restauration503 ou activation budget n’est modifié.

Tests contractuels locaux et garde du hook ; rendu Helm réel obligatoire dans la CI
existante après setup-helm. Helm absent localement : téléchargement officiel refusé
HTTP403, sans fichier reçu et sans contournement. La CI du commit assemblé et la
recette de livraison restent nécessaires. Voir infra/helm/STAGED-API-ROLLOUT.md.
