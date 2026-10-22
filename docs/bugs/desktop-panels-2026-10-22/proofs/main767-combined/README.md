# Intégration du main #767 — reçus locaux expurgés

Le build terminé porte le commit `838684f007255fb0f91177f5e1598940ad084fca`, arbre `80adcca16ab90b3560baaa145eda7e36d8d2114b`. Il intègre le main `5de3fac6e5d720d41bd6dde1b2c6170b734b0cc3` à la tête précédente `d8739887ae5cdba652a0eab97674928c6915a8b7`. Le reçu de merge atteste les 36 autres fichiers entrants identiques, l’union BaseChat et les 475 fiches de l’inventaire sans perte.

## Échec conservé et correction de la garde

La CI d873 échoue sur la garde de montage : son extraction trouve 3 594 caractères au lieu d’un corps inférieur à 2 000. La reproduction locale donne cinq succès et un échec. Le téléchargement des logs a été refusé HTTP 403 et n’a pas été retenté ; les annotations structurées et la reproduction locale fournissent le constat.

La correction place le montage des identités dans un `beforeAll` de suite dont la fermeture est reconnue par la garde inchangée. Son budget reste explicitement de 30 000 ms. Les six parcours conservent leurs gestes, assertions et délais de 90 000 ms ; les deux anciens handoffs et leurs helpers sont identiques octet pour octet. Une identité synthétique est partagée par largeur, avec trois projets distincts et des contextes de navigateur neufs. Un redémarrage de worker réexécute le montage.

La garde corrigée donne six succès sur six en 2,44 s ; ESLint, Prettier et diff-check ciblés passent. Le reçu statique distingue ces exécutions antérieures de la comparaison ultérieure des fichiers et de l’index.

## Échecs initiaux du banc et validation complète terminée

Les sorties initiales 137 du build et du typecheck API sont conservées. Elles surviennent sous charge parallèle ; leur code seul ne prouve pas une cause mémoire précise. La reprise séquentielle donne build, typage complet et hooks verts ; lint zéro erreur et 52 avertissements existants.

La première suite complète compte 25 fichiers rouges : 24 recettes Playwright privées collectées par Vitest et un échec suivi lié au cache administrateur incomplet. Elle compte aussi 1 299 fichiers verts, deux fichiers omis, 10 001 tests verts, un test rouge et sept tests omis.

Les recettes privées ont été préservées hors du périmètre de collecte pendant la nouvelle exécution, puis restaurées. Aucun test suivi ni configuration suivie n’a été exclu ou modifié. La garde hors ligne d’origine a passé après préparation du cache avec verrouillage des dépendances ; elle n’a pas été remplacée par une vérification en ligne.

La suite complète finale donne **1 301 fichiers verts, deux fichiers omis ; 10 018 tests verts, sept tests omis, zéro échec**, en 300,28 s. La commande et l’empreinte du log privé figurent dans `merge-receipt.json`. Ces résultats sont locaux, pas des résultats CI de la future tête publiée.

## Limites et confidentialité

Sur `838684f007255fb0f91177f5e1598940ad084fca`, arbre `80adcca16ab90b3560baaa145eda7e36d8d2114b`, **23/23 parcours directs, zéro retry et zéro omission** : [12 ciblés](targeted-results.json), [2 tactiles](touch-results.json), [9 docking/navigation](rpl-results.json). Le cas réouverture vérifie l’absence de rejeu de propositions, pas une sauvegarde distante universelle. Build local5226, API réelle3017/PostgreSQL dédié, identités synthétiques, aucun appel fournisseur demandé. Les configurations exactes `.txt` sont jointes, à replacer dans `.vibecore/ux-qa/` (tactile dans `preview-audit/`). Chromium système, un worker, zéro retry.

Le [reçu du build](build-receipt.json) atteste 9 444 sources comparées aux blobs Git sans différence et 2 306 fichiers compilés ; asset HTTP concordant. Archive complète locale, empreinte publiée, pas de gros build transféré. Captures de focus inspectées : [1440](focus-after-1440.png) et [1024](focus-after-1024.png), données synthétiques uniquement. Safari local reste non exécuté après refus WebKit403, sans nouvelle tentative. Les rouges historiques restent conservés.

Les trois reçus ont été inspectés avant copie. Ils contiennent uniquement provenance Git, chemins techniques, empreintes, comptes et explications expurgées : aucun token, cookie, session, identité personnelle, réponse API brute, trace réseau ou log brut. Les manifestes complets sources/compilés sont ajoutés sous forme de chemins relatifs et empreintes. Le texte « proposedRemediation » dans le reçu CI décrit l’état historique gelé avant correction ; il ne décrit pas l’état actuel.

`SHA256.json` atteste les fichiers de ce dossier. La préparation initiale des reçus a été faite hors dépôt ; leur ajout documentaire ne change pas le produit compilé.
