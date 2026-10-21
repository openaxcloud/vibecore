# Publication : chargement, disposition et action

Preuves locales sur le build `f78327169bc834d59a8dad75975ec121761848df1faec7ff03a35bc53eec3ff0`, main fc8a687e + #750 + #753. PostgreSQL/API réels synthétiques, même déploiement FAILED existant ; aucune publication recréée, aucun fournisseur appelé.

L’échec mobile FR initial reste conservé dans la recette combinée précédente. Un scénario réduit a ensuite réussi 1/1 : BFF200 avec FAILED et un journal, bouton inférieur visible, focus et hit-test réussis, journaux ouverts puis fermés. La matrice instrumentée suivante termine à **5/6** ; desktop EN échoue après 5s, sans réponse deployments reçue, DOM « Loading publish… », bouton absent. Captures, DOM et réponses sont conservés ici. Ces résultats ne prouvent pas la résolution du chargement intermittent et ne sont pas un résultat 6/6.

Un défaut indépendant est mesuré : libellé supérieur hors du bouton mobile FR de28,156px. Les métriques et capture avant sont dans les fichiers publication-header. Le scénario `publication-actions.cjs` conserve toutes les assertions d’action et ajoute la vérification du contenu à l’intérieur du bouton supérieur. Aucun timeout augmenté ni force-click.

Le nouveau main4e79230ccfd63cb9562b88ffe9b8fe911f0bcb28 est inspecté séparément : seules la préparation Git API, ses preuves/tests et une documentation de variable changent. Aucun chevauchement avec le correctif CSS ; aucune validation du nouveau main n’est déduite de ce banc fc8.

## Résultat après correction

Build complet réussi, empreinte `110e569ee6bd6abf043c608d891868fe814b02f863bec671639d70a6ae51ff6a` : [manifeste](after-manifest.json), [reçu](receipt.json). Un seul fichier produit diffère du build précédent : index.scss. Archive conservée localement.

La première exécution après build échoue sur « Chargement de publier… », sans réponse deployments reçue dans le diagnostic ; ses capture/DOM/état restent dans les fichiers publication-wrap-after. Aucun succès CSS n’en est déduit.

Onze anciens serveurs frontend UX ont été identifiés par leurs commandes, ports et logs de recettes terminées, puis arrêtés ; 5208 et API3015 sont conservés. SIGKILL seulement après constat que SIGTERM ne terminait pas les serveurs concernés. Aucun fichier/projet supprimé. [Relevé](banc-cleanup.json). /ready observé2,48s avant puis9,9ms après : observation ponctuelle, pas preuve causale ni benchmark.

La recette après nettoyage termine **6/6**, FR/EN sur390/768/1440, aucune erreur initiale de visibilité : [matrice](publication-wrap-after-cleanup-publication-matrix.json). Texte du bouton supérieur contenu, pas de débordement document, focus et hit-test, cible tactile44px, actions des DEUX boutons vérifiées avec ouverture et fermeture effective du journal. Les réponses BFF200 contiennent le déploiementFAILED et son journal.

[Avant mobile FR](publication-header-publication-after-390-fr.png) et [après mobile FR](publication-wrap-after-cleanup-publication-after-390-fr.png). Avant : contenu à377,156 pour un bouton finissant349. Après : contenu à339 pour un bouton finissant349, clientWidth=scrollWidth=136. Le menu bas mobile est conservé.

Les quatre tests de jetons de thème passent. Le contrôle d’index initial a détecté le frontmatter manquant de la nouvelle fiche ; fiche corrigée, index régénéré, six tests réussis sans modification des assertions.

## Reproduction

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5208 UX_QA_OUTPUT_DIR=/tmp/publication-actions UX_QA_SESSION_FILE=/chemin/prive/session-synthetique.json node docs/bugs/ux-publication-actions-2026-10-21/publication-actions.cjs
```

La fixture privée contient projectId et cookies synthétiques existants. Le script conserve l’échec de visibilité5s ; s’il poursuit après réponse BFF pour diagnostiquer l’action, le processus sort toujours1 et la matrice marque initialVisibilityFailed. Aucun délai fixe ajouté, aucune assertion relâchée. Les rouges précédents restent rouges ; ces6succès ne valident pas la suite complète43/45 ni le nouveau main.
 Aucun panneau entièrement certifié. Les deux défauts communs de montage BaseChat attendent le chantier éditeur.

## Deux flaky CI ciblés, sans retry

[Résultats](flaky-targeted-results.json), [sortie](flaky-targeted.txt), [Webview](ux-flaky-targeted-webview.png), [panneau](ux-flaky-targeted-panel.png) : 2/2 en25,5s. Croix x338, largeur44, bord droit382≤390 ; fermeture effective. Voile et pastille à772, point6px au-dessus dans le panneau, non flouté. La hauteur mesurée de la croix est36px : la cible verticale n’est pas certifiée. Les assertions et délais existants sont conservés. Ces réussites ne résolvent pas la cause intermittente CI et ne remplacent pas la recette commune attendue avec le chantier éditeur.

## Format des preuves et scan de secrets

Le scan gitleaks8.21.2 de d6b719fe signale930 valeurs SHA dans dix fichiers de preuve. Chaque ligne est vérifiée comme valeur hexadécimale40/64caractères d’un champ JSON ; aucune valeur de credential trouvée dans ces signalements. Les manifestes utilisent maintenant `chemin: {"sha256": "empreinte"}` plutôt que d’associer directement une empreinte à un nom de fichier contenant api/key/client. Les champs apiHead/apiCommit deviennent backendRevision. [Reçu de conservation](proof-format-receipt.json) : égalité exacte de toutes les associations chemin/empreinte après décodage. Aucun fichier .gitleaks, workflow ou règle de sécurité modifié ; aucune exemption.

Le scan complet local gitleaks8.21.2 du contenu normalisé termine avec **zéro signalement**, configuration du dépôt inchangée ([sortie](gitleaks-normalized.txt)). Le contrôle CI doit encore être rejoué sur la tête publiée.
