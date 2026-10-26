# Validation du lot UI public et Administration

Lot local distinct de #801, basé sur `7759cbcbd`. Les corrections portent sur les repères et actions des pages légales, l’ancre StudentDPA, la route enfant Blog, les noms d’offre longs dans Admin et le hero marketing Déploiements. Aucun panneau IDE, API, schéma, droit, contenu juridique ou destinataire modifié. Les cartes Blog et le contrat Newsletter restent des défauts ouverts.

## Source et validations

- 60 tests ciblés uniques dans 9 fichiers : Légal 27, Admin 18, Blog 4, Hero 11. Les répétitions après correction ne sont pas ajoutées à ce total. Deux tests de route Blog sont rouges avant et verts après le correctif ; le reste réutilise les suites existantes.
- Builds client/SSR réussis sur `222495dda`, puis `5285a7e01`, puis `c2823890d` après la correction de hauteur du CTA. Le dernier build sert la recette finale 13899. Les résultats successifs restent distincts.
- Typage complet réussi après réparation des liens de dépendances locaux. La première exécution avait échoué dans les scripts QA parce que deux copies Prisma, pourtant identiques, provenaient de worktrees différents. L’overlay local de liens réunit les packages de CE worktree ; aucun paquet partagé, source backend, configuration de typage ou contrôle n’est modifié. Le contrôle web a ensuite été repris après la grille Hero ; le dernier delta est uniquement la priorité d’une classe CSS, vérifiée par build et navigateur.
- Lint global final : zéro erreur, 52 avertissements préexistants. Le premier passage avait relevé une ligne JSX Admin à reformater. Le JavaScript émis avant/après ce formatage est strictement identique, vérification archivée. Aucun rebuild fonctionnel n’est revendiqué après ce formatage seul.
- Index : 520 fiches. Le premier contrôle a détecté trois identifiants frontmatter absents ; ils ont été ajoutés avant régénération ; les six tests passent après correction. Les quatre fiches de #800 distinguent maintenant fusion main confirmée et recette production non effectuée.
- Scan Gitleaks complet final : sortie 0, aucune fuite détectée, aucune exclusion ajoutée.
- Revue indépendante Légal/Blog et revue ciblée Hero favorables ; les réserves de recette compilée sont closes par les reçus finaux correspondants. La revue Admin a été faite séparément par le parent, pas par son auteur.

## Recettes compilées

- Admin : 20 observations et 4 parcours clavier/redimensionnement sur le build commun 222495dda ; nom complet et valeur conservés, aucune mutation financière.
- Blog : 20 observations et 4 parcours d’historique sur le même build ; vrai contenu enfant rendu. La navigation du harness vers une URL connue ne prouve pas la réparation des cartes réelles.
- Légal : 160 observations sur quatre routes corrigées, 8 ancres froides et 4 parcours ; 440 observations supplémentaires sur onze autres routes. Les quatre actions DPA contiennent leur texte et mesurent au moins 44 px ; le tableau Subprocessors reste dans un conteneur horizontal défilant, avec focus du lien testé.
- Hero : la première recette 13799 a échoué à 844 px sur un bouton de 22 px, malgré trois premières observations réussies. La priorité locale `!min-h-[44px]` corrige le variant responsive. La recette finale 13899, sans injection CSS, passe 44 observations et 8 groupes clavier ; bouton 44 px, grille et textes contenus.
- Solutions/Produit : 1 276 observations, 8 contrats et 32 groupes représentatifs sur 30 IDs. Les défauts internes trouvés pendant cette baseline restent archivés ; l’absence de débordement document n’est jamais assimilée à une absence de clipping interne.

Les captures finales Hero FR 320 et Équipe/Blog/Légal ciblées ont été inspectées ; aucune inspection exhaustive de chaque pixel de toutes les captures n’est prétendue. Les erreurs de démarrage du harness et le premier build légal interrompu avec le code 137 sont conservés dans leurs dossiers, séparément des erreurs produit. Après nettoyage de serveurs propres résiduels, le build légal a réussi avec un heap de 6 GiB, sans nouvel événement OOM.

## Couverture et limites

La [matrice complète](../ui-p2-coverage-2026-10-26/README.md) distingue 160 IDs partiellement exercés, 37 non exercés réservés à d’autres sessions, 5 réservés historiques et 155 hors UI, sur 357 IDs. Les 66 transitions P2 sont disjointes. Une route dynamique n’est couverte que pour les valeurs effectivement testées ; alias et protocoles ne deviennent pas des pages indépendantes.

Chromium local, données et réponses synthétiques uniquement ; les contrôles réels du backend ou de production ne sont pas déduits de ces recettes. Aucun achat, changement de droits, envoi d’email ou acceptation juridique. Polices tierces bloquées. Safari/Firefox, lecteur d’écran, clavier OS, safe areas physiques et contraste WCAG ne sont pas certifiés. Le zoom natif 200 % du lot P1 garde son propre périmètre, sans extension implicite à ces pages.

Les processus de recette sont vérifiés par origine, PID et startTicks ; port fermé et processus terminé sont désormais distingués. Les zombies sans mémoire active sont documentés comme tels. Aucun processus incertain ou tiers n’a été terminé. Journaux archivés avec espaces finaux et lignes vides terminales normalisés seulement ; originaux `/tmp/ui-public-admin-*` conservés.

Ce lot n’est ni publié ni livré. Avant publication : intégrer le main coordonné, préserver l’union de l’index, vérifier la tête exacte et respecter la livraison de la PR précédente. Aucun statut global ou production n’est promu par ce document.
