# Sécurité du compte : audit local, sans correctif produit

Sources figées de #792 (`71d080c9c`), build existant réutilisé sur localhost7299, API synthétique isolée3499. Les empreintes sont dans `baseline/source-sha256.txt`. Ces mesures précèdent le correctif Factures du lot suivant ; aucune modification des pages Sécurité n'est proposée. « Baseline » désigne cet état audité, pas un état contenant nécessairement un défaut. Aucun compte réel ou environnement de production utilisé.

## Matrice exacte

| Vérification | Couverture | Résultat |
| --- | --- | --- |
| Affichage initial |2routes ×320×740,390×844,844×390 paysage,820×1180,1440×900 ×FR/EN ×clair/sombre |40 observations : document, titres, boutons, liens et champs contenus ; zéro erreur JS |
| Formats supplémentaires |2routes ×360×800,768×1024,1024×768,1280×800,1920×1080,2560×1440 ×FR/EN ×clair/sombre |48 observations supplémentaires, mêmes assertions vertes |
| Zoom desktop natif200% |2routes ×FR/EN ×clair/sombre |8cas : fenêtre physique1280, largeur CSS640, DPR2, visualViewport.scale1, document640 ; boutons des formulaires Sessions≥44px ; zéro erreur JS |
| Confirmation de session |FR/EN ×clair/sombre,320px |4groupes : ouverture clavier, focus dans le dialogue, un Tab, Échap et retour à l'ouvreur. Aucune confirmation de révocation |
| Saisie et resize |Mêmes4groupes |Liste IPv6 saisie conservée à320→820→320 |
| Erreur GET et récupération |FR/EN pour chaque route |4groupes : erreur503 des sessions ou du statut MFA, Retry au clavier puis rétablissement. L'état MFA inconnu n'affiche pas un faux badge désactivé |
| Navigation |FR/EN |2groupes : lien clavier Sécurité→Sessions puis Retour |

Total : **88 observations géométriques sur11formats, plus8cas de zoom**, distinctes des parcours fonctionnels. Routes : `/session-security` et `/security-settings`. Aucun nouveau défaut confirmé dans ce périmètre ; aucun patch produit issu de cet audit.

Fixtures : nom de profil long, session fictive avec IPv6 longue et userAgent synthétique long. Le produit traduit ce userAgent en nom d'appareil/navigateur connu ; aucun texte de traduction artificiellement allongé. Les listes d'IP saisies restent uniquement dans le formulaire. Le cookie `synthetic-ui-fixture` est un marqueur local, pas un accès réel.

## Preuves et limites

Reçus JSON, journaux et captures dans `baseline/`, `extended/` et `zoom/`. Captures standard archivées :320, paysage844,1440 puis360,1024,2560, en FR/clair ; erreurs FR/EN et8captures de zoom. Les observations JSON couvrent les autres dimensions et thèmes.

Les sondes annulent toute requête nonGET et tout appel tiers. Les reçus indiquent `writes: []` ; aucune création/révocation de session, token ou accès, aucune configuration MFA, aucun code de secours généré, aucune politique enregistrée. Les profils Chromium temporaires utilisés pour le zoom sont supprimés après fermeture.

Non couverts : backend réel, production, hub sécurité entreprise, actions de révocation ou de configuration, Safari/Firefox, lecteur écran, safe areas, clavier OS, tous contrastes et tous cycles de focus. Le dialogue a reçu un Tab puis Échap : ce n'est pas un audit exhaustif du piège de focus. Les sondes d'affichage contrôlent les boîtes de contrôles et la largeur du document ; elles ne démontrent pas la lisibilité de chaque texte dans tous les états. Le zoom est réglé au démarrage via les préférences Chromium, sans deviceScaleFactor/pinch/CSS zoom ; aucune bascule de zoom pendant saisie revendiquée.

## Reproduction

Les scripts utilisent `require('@playwright/test')`, résolu depuis les dépendances du dépôt, et `/usr/bin/chromium`. Créer `/tmp/ui-security`, `/tmp/ui-security/extended`, `/tmp/ui-security/zoom`. Copier `fixtures/extra.json` et `fixtures/errors.json` dans `/tmp/ui-security/`, puis démarrer `node docs/bugs/user-area-secondary-2026-10-25/security/fixtures/fixture.cjs`. Servir le build depuis la racine contenant `build/client`, avec `HOST=127.0.0.1 PORT=7299 SAAS_API_URL=http://127.0.0.1:3499 node node_modules/@react-router/serve/bin.js build/server/index.js`.

Lancer séquentiellement `scripts/matrix.cjs`, `scripts/matrix-extended.cjs`, `scripts/recovery.cjs`, puis `UI_BASE_URL=http://127.0.0.1:7299 UI_EVIDENCE_DIR=/tmp/ui-security/zoom node .../scripts/zoom.cjs`. Les trois premiers scripts fixent explicitement localhost7299 et écrivent dans `/tmp/ui-security`. Les quatre commandes ont terminé avec code0. Ne pas reconstruire les assets pendant la recette ; ne pas paralléliser les sondes avec `recovery.cjs`, qui modifie temporairement `errors.json` puis le réinitialise.

Aucune validation build, lint ou suite globale supplémentaire n'est revendiquée par cet audit en lecture seule.
