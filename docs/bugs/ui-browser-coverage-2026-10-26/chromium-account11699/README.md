# Données et Connexions — complément Chromium11699

Complément local après constat de WebKit absent, sans changement produit. Build existant fourni par le parent, tête6b8940ec8 conservée pendant cette recette ; app11699/API6099 synthétique isolée gérée par public_ui_audit. Origines archivées : appPID168972/startTicks2358701, APIPID168957/startTicks2358577. Les empreintes de deux routes sont dans source-sha256.json.

## Nouvelle recette ciblée

`receipt.json` :40 observations = dialogue Données et page Connexions ×320×740,390×844,844×390,820×1180,1440×900 ×FR/EN ×clair/sombre.8 groupes d’interactions : description associée, focus initial du champ, cinqTab confinés, brouillon conservé au resize, bouton destructif désactivé, Escape/Annuler/restauration du focus, réouverture confirmation vidée, navigation Connexions puis Retour natif vers Données sans dialogue résiduel. Un contrôle supplémentaire de réouverture/Annuler utilise640×400 de reflow ; **ce n’est pas du zoom natif** ni un sixième format de la matrice.

Le script ne fait pas scrollIntoView pour rendre artificiellement le bouton destructif visible. Il vérifie son état désactivé, pas sa visibilité intégrale après chaque redimensionnement. Aucune saisie de l’email valide et aucune confirmation de suppression. Connexions est une liste synthétique vide, pas un backend connecté.

`recovery.json` :4 cas FR/EN clair320, deux routes. GET503 sur `/account/deletion` ou `/api/account/connections` ; le loader rend volontairement la page d’erreur locale avec HTTP200. Focus sur Réessayer, resize320→844×390→820×1180→320, focus conservé, restauration du GET puis Enter : erreur disparue et contenu revenu. Ce ne sont pas quatre réponses HTTP503 de la page entière. Les autres ressources Connexions restent disponibles ; panne partielle de l’intégration uniquement, pas les trois ressources ni403/401.

Zéro erreur JavaScript dans les deux reçus. GET uniquement, tiers bloqués ; aucun export, connexionOAuth, révocation, suppression, accès permanent ou POST métier exécuté. Les clés de panne de cet audit sont restaurées en conservant les autres clés partagées. Aucun changement des fixtures5499, du ControlPanel `/settings` ou de l’IDE.

## Différence avec les preuves historiques

La matrice historique88observations/11formats et8groupes sur7099 reste dans `user-area-2026-10-25/integration-main-d090/account-payment`. Ici,40observations/5formats vérifient les parcours sur11699 et les quatre erreursGET ajoutent une preuve ciblée de récupération. Elles ne constituent pas une nouvelle couverture WebKit, ni un replay des11formats ou de tous les états. Les paramètres source correspondants sont inchangés pour cet audit.

Captures : Données FRclair320, paysage844 et1440, puis quatre erreursGET FR/EN. Pas d’inspectionpixel exhaustive de tous les thèmes/formats. Aucune conclusion Safari/Firefox, lecteurécran réel, clavier virtuel OS, safeareas matérielles, zoom dynamique ou recette production. Fonctionnement complet des connexions et cycle de suppression restent non exécutés.

## Reproduction

Depuis la racine du dépôt, dépendances/Chromium présents, serveur synthétique équivalent prêt :

```sh
UI_BASE_URL=http://127.0.0.1:11699 UI_EVIDENCE_DIR=/tmp/ui-account-browser11699 node docs/bugs/ui-browser-coverage-2026-10-26/chromium-account11699/account.cjs
node docs/bugs/ui-browser-coverage-2026-10-26/chromium-account11699/recovery.cjs
```

Le script de récupération conserve l’origine11699 et le chemin local `/tmp/ui-browser-zoom-next/failures.json` de cette exécution : les adapter uniquement à une fixture synthétique isolée si réexécution ailleurs. Les imports Playwright archivés utilisent la résolution normale du dépôt. Aucun serveur démarré/arrêté par cet audit ; navigateurs fermés après les deux scripts. GO transmis au propriétaire des serveurs, pas d’arrêt de processus tiers.
