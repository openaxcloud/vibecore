# Entrées compte/offre et compatibilité — recette locale12399

[Contrats, périmètre et fixture](contracts.md). Worktree isolé depuis `b72c48322a245d72be501a252809f0d844638a28`, aucun changement produit/index/commit. Build existant safecontent UI975 + intégration main servi en lecture seule ; aucun build lancé. [Empreintes](before12399/build-source.sha256).

## Résultats et dénominateurs

**5 IDs alias et8 IDs compatibilité**, tous partiellement exercés dans cette phase ; pas13 nouvelles pages rendues indépendantes. Cinq destinations d’alias +10 états compatibilité (état connu/inconnu de deux résolveurs) ×5 formats ×FR/EN×clair/sombre = **300 observations géométriques**, pas300 tests produit ni300 parcours complets.

Formats :320×900,390×844,844×390 paysage,820×1180,1440×900. [Reçu](before12399/receipt.json) : zéro débordement horizontal du document ou des éléments ciblés, zéro erreur JavaScript, zéro échec de statut/destination.160 réponses finales404 et140 réponses finales200 parmi les observations. La langue réellement portée par HTML correspond aux300 observations attendues, y compris les alias perdant leur query après la redirection : la page sentinelle avait établi la préférence FR/EN avant le parcours.

**60 groupes simples** (15 états×4 modes) : après redimensionnements successifs, Tab atteint le lien « Aller au contenu » / « Skip to content », Escape puis Back retourne à la sentinelle Quota dans60/60 cas. Ce résultat ne prouve pas un parcours clavier exhaustif de tous les contrôles ni le fonctionnement complet des menus/modales. Aucun formulaire métier soumis.

[Preuve des IDs réellement matchés](before12399/matched-route-ids.json) : `window.__reactRouterDataRouter.state.matches` confirme10 états associés aux8 IDs de compatibilité. Le catch-all `$` est réellement utilisé sur `/synthetic-missing/deep/path`, distinct de `$slug` sur une URL à un segment. `marketing.$slug` reste son propre ID bien qu’il réexporte `$`. La route enfant `/u/:username/:projectname` matche son parent et son propre ID ; pas de double comptage.

[Contrats HTTP sans suivi](before12399/contracts-http.json) : les cinq alias ont leurs status et Location attendus ; les quatre profils renvoient une vraie404. Les contenus connus `/home` et `/advanced/mobile` répondent200. Ceci ne couvre pas toutes les surfaces connues, valeurs de paramètres ou branches de session/canonicalisation.

[Sonde thème indépendante](before12399/theme-probe.json) : les quatre modes de configuration FR/EN×clair/sombre sont effectivement appliqués sur advanced/mobile (classes et data-theme, couleurs calculées distinctes). Pas une mesure exhaustive de contraste.

## Visuel, réseau et limites

30 captures FRclair (320 et844) archivées. Inspection visuelle ciblée seulement de catch-all404320, advanced/mobile320 et destination Upgrade320 : contenu et textes présents, sans coupure horizontale apparente dans cet échantillon. Aucune inspection exhaustive de300 captures ; il n’y a que30 captures.

API6499 entièrement synthétique, données GET propres à chaque endpoint. Navigateur : zéro mutation tentée,360 demandes de polices Google bloquées. Précharge serveur interdit fetch extérieur et nonGET ; aucune tentative serveur rejetée consignée. Les polices externes bloquées limitent la fidélité typographique à la production. Les demandes vers l’API consignées dans requests.jsonl sont uniquementGET ; aucune donnée réelle, checkout, portail, fournisseur ou export contacté.

Aucun nouveau défaut produit reproduit dans le périmètre mesuré ; aucun correctif demandé ou appliqué. Absence de défaut observé ne signifie pas page complètement validée. Non exercés : zoom200%, lecteurs d’écran, contraste WCAG calculé, Safari/Firefox, clavier virtuel et safeareas matériels, parcours complet de menu, actions des destinations, états auth réels, tous les slugs/sections, personnalisation arbitraire du contenu. Seuls les états connus/inconnus listés dans contrats.md sont exercés. Les formulaires API et moyens de récupération des destinations ne sont pas certifiés par la simple visite d’un alias.

Tous navigateurs fermés par finally. App12399 PID177333 et API6499 PID177332 arrêtées uniquement après comparaison des startTicks avec leurs preuves d’origine ; [cleanup.json](before12399/cleanup.json) confirme refus de connexion111 sur les deux ports. Aucune fixture partagée ni serveur d’une autre session arrêté. Aucun statut main/production modifié, aucun index de couverture commun régénéré.
