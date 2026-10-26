# Cibles des autorisations : recette compilée 9899

Build final fourni par le parent, serveur local 9899 et API synthétique 4399. Les empreintes du build et des deux routes figurent dans `source-build.sha256`. Cette recette complète celle du build 9699 : elle utilise le correctif compilé `min-h-[44px]`, sans injection CSS dans le navigateur.

## Résultats

12 observations : deux routes × 320/768/1440 px × FR/EN, thème clair. Les 19 labels de chaque observation sont mesurés et activés par clic sur leur texte, puis par Espace après focus. Les sélections finales sont comparées intégralement aux sélections initiales.

| Route | 320 px, FR/EN | 768 px, FR/EN | 1440 px, FR/EN |
| --- | --- | --- | --- |
| organization-roles | minimum 51,875 px | minimum 51,875 px | minimum 47,03125 px |
| roles-and-permissions | minimum 44 px | minimum 44 px | minimum 44 px |

228 labels associés et activables vérifiés, 228 clics sur texte et 228 activations Espace ; 228 sélections restaurées. Toutes les cibles complètes atteignent 44 px. Les labels de roles-and-permissions à 1440 passent de 33 px sur le build 9699 à 44 px sur le build final 9899. La taille du seul input (13 px) n'est pas utilisée pour juger la cible. Le seuil de 44 px correspond à l'objectif demandé et à la convention locale ; aucune conclusion globale WCAG n'est tirée.

Zéro erreur JavaScript, aucune requête non-GET tentée. Aucune soumission de formulaire ni modification de rôle ou permission réelle. Tous les navigateurs et contextes ont été fermés. Sources, index et commits inchangés par cette recette.

## Preuves et limites

`results.json` contient les dimensions par label, associations et restaurations ; `check.txt` contient le verdict ; quatre captures des fieldsets à 320 px accompagnent les mesures. `check.cjs` est le harness (exécuter avec NODE_PATH pointant vers les node_modules du dépôt si nécessaire).

API synthétique uniquement ; les tiers, dont Google Fonts, sont bloqués. Pas de recette production, de backend réel, de nouveau thème sombre, zoom, format ou autre page dans ce complément. Les preuves précédentes du serveur 9499 et la mesure rouge du serveur 9699 restent distinctes.
