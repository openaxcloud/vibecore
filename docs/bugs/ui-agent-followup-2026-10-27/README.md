# Agent — Escape, panneau initial et hauteur du sous-menu

Base : main `6de692cf5d58f7e084c117ed8fd58c7c6e74cd6a`, #819 livré. Le parent a observé deux défauts dans sa session authentifiée cloud le27octobre2026 à20:03–20:07UTC, à1180×757 : Escape sans effet dans le sous-menu modèle, et Agent sélectionné avec un corps Webview startup à l’ouverture. Cette session reproduit localement la fermeture manquante et la divergence onglet/corps ; elle ne revendique pas une identité pixel avec le contenu du projet client.

## Corrections

- Les réglages ouverts et leur second panneau porté à body possèdent Escape. Le raccourci global leur laisse l’événement, y compris lorsque le contrôle remplacé a rendu le focus à body. Le propriétaire respecte un événement déjà consommé, ferme le panneau et rend le focus au déclencheur. Ctrl+S, Escape extérieur et les dialogues enfants gardent leurs comportements.
- À moins de1200px, l’entrée sans panneau explicite ouvre Agent. La mémoire historique `ui.mobilePanel` ne remplace plus tardivement le corps en laissant l’onglet Agent sélectionné. L’URL et les choix de l’utilisateur restent prioritaires. Les autres champs de mémoire sont conservés.
- Le second panneau desktop était déjà coupé de6.09px à1440×900 avant ce lot. Sa hauteur maximale retranche désormais sa position haute et la marge existante ; le défilement conserve toutes les options.

## Validation locale

| Parcours | Couverture réellement exécutée | Résultat |
| --- | --- | --- |
| Mémoire tardive, entrée Agent | 320/768/1180, témoin desktop1440 | Avant3 divergences compactes ; après cohérent |
| URL Preview contre mémoire Files, clic Files pendant attente | 320/768/1180 | 10cas de navigation au total réussis, avec reload/Back/Forward |
| Saisie et changement de disposition | 1180→1440→768→320→1180 | Brouillon conservé |
| Escape sous-menu, focus, Retour, réouverture | 320/390/768/1180/1440 | 5formats réussis |
| Génération active | SSE synthétique à1180 | Escape ferme sans abort ; Stop explicite abort |
| Bornes du panneau, derniers éléments et scroll | 1440×900,1280×720 et2zooms natifs200% | 4cas réussis, tolérance1px inchangée |

Le zoom utilise les fenêtres physiques1440×1000 et2560×1440 ; les dimensions CSS mesurées sont720×456 et1280×676. Ce n’est pas une simulation par CSS zoom. Les captures CDP et reçus contiennent les mesures exactes. Chromium local, données synthétiques, appels externes et mutations bloqués. Zéro erreur page dans les recettes finales. Les premières erreurs de script dans des iframes opaques, le premier scénario de bouton désactivé et les mesures avant correction ne sont pas comptés comme validation finale.

- 45tests unitaires distincts réussis, dont6régressions Escape ;3cas rouges initiaux puis1cas rouge body avant correction. Les13tests rejoués après le complément de hauteur ne sont pas ajoutés à ce total.
- 6contrôles d’index réussis, index534. Build client/SSR final réussi ; typage officiel complet réussi après alignement des dépendances locales déjà installées ; lint global0erreur/52avertissements, lint E2E et diff-check verts.
- Revue indépendante favorable : [rapport](validation/independent-review.md). Empreintes des sources finales dans [source-hashes.json](validation/source-hashes.json).
- Cinq nouveaux scénarios dans responsive-ide.spec.ts sont collectés localement ; leur exécution avec le backend isolé relève de la CI de cette PR, pas de la recette API synthétique.

## Preuves et limites

[Navigation avant/après](navigation/README.md) ; [Escape, flux et zoom](escape/README.md). Les scripts sont conservés pour reproduction depuis le dépôt, avec une origine locale explicite et les fixtures réseau de docs/bugs/ui-agent-evidence-2026-10-27/harness. Les chemins absolus des reçus décrivent l’environnement de mesure.

Le typage a d’abord échoué sur des liens absents puis sur deux identités Prisma issues de namespaces pointant vers l’ancien worktree. Des wrappers locaux de dépendances ont été alignés vers ce worktree, avec pnpm9.14.4 déjà installé ; aucun manifeste, lockfile, client ou schéma backend n’a été modifié. Un lancement initial du garde d’index avec node:test était inadapté ; le garde a ensuite été exécuté avec Vitest, son moteur réel.

Aucune recette authentifiée de production du correctif, aucun appareil Safari physique, aucune course de changement de projet SPA, aucune certification globale UI. Ni palette#768 ni publication groupée interrompue reprises. Les appels de navigation de la recette ne créent pas de projet réel. La livraison et les verdicts CI sont suivis dans la PR ; ces preuves locales ne les remplacent pas.

## Contrôle de sécurité des preuves

La première CI sur `c96baacd3` a bloqué sur trois détections `generic-api-key` dans les JSON d’empreintes : le chemin `useKeybindings.ts` et son SHA-256 étaient sur la même ligne. Ces trois fichiers utilisent désormais des champs `path` et `sha256` séparés, sans changer aucune empreinte. Aucun secret, aucune règle ni liste d’exclusion n’a été ajouté. Gitleaks 8.21.2, avec la configuration et les exclusions du dépôt, a ensuite analysé l’arbre suivi exporté : sortie 0, aucune détection. [Reçu local](validation/gitleaks-final.txt). Cette correction documentaire exige ses nouvelles validations CI avant fusion.
