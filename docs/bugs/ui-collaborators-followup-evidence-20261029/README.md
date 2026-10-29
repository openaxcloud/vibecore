# Snapshots et Collaborators — audit borné du 29 octobre 2026

Build local f96ddd270, Chromium, API et WebSocket synthétiques isolés. Aucune source du dépôt modifiée, aucun Create/Restore/Invite/permission/comment/link envoyé, aucun backend réel. Les navigateurs se ferment en finally.

## Couverture ciblée

- Snapshots : 390/820/1280 vide avec chargement visible, libellé/chemin long avec détail déplié au clavier, et503→Retry au clavier→vide :9recettes. Le premier vide390 avait une mesure0px pendant remount ; snapshots-empty-connected refait3/3 avec dimension positive obligatoire. Pas de snapshotcréé/restauré.
- Collaborators : vide390/820/1280 et503→Retry→vide,6recettes passent avec brouillon email synthétique non soumis. Données longues :3formats rouges puis3contrepreuves CSS vertes.

## Défaut produit reproduit

Le paragraphe de commentaire contenant une URL longue déborde. Reçu collaborators-long-geometry : clientWidth358/771/588, scrollWidth3382/3382/2903. Les fixtures HTTP et collaboration.ready en WebSocket portent les mêmes commentaires (sinon le client remplace les commentaires par un snapshot vide et masque le problème). Captures d’échec montrent le commentaire. Counterproof3/3 : une seule règle `.bolt-project-collaboration-comment p { overflow-wrap: anywhere; }`, sans troncature, ramène scrollWidth à358/771/588. Patch NON appliqué : collaborators.patch, app/styles/index.scss uniquement. Ce n’est pas encore une preuve de build corrigé.

## Limites de recette et incident distinct

- Premier sélecteur input[name=userId] prenait aussi un champ caché de permission ; corrigé en excluant type=hidden. Échecs de harnais conservés dans collaborateurs-long, aucun défaut produit déduit.
- Deux échecs initiaux ont perdu le brouillon avant une assertion lors du resize820/1280. Instrumentation ultérieure des handles :3formats et3essais1280→390→1280 rapides passent, mêmes nœuds connectés. Les redimensionnements rapides ne prouvent PAS un remplacement de coque : cette recette ne synchronise pas sur le commit mobile. Cause des deux pertes initiales inconnue, ni corrigée ni assimilée au WebSocket. Diagnostic borné arrêté conformément à la coordination ; il faudrait une preuve de détachement/commit de coque avant toute correction.
- Les états de présence temps réel sont synthétiques. Pas de reconnexion réseau réelle, de Safari, de zoom200%, de safearea ou de clavier virtuel certifié. Couverture partielle de2panneaux, pas certification globale.

## Reproduction

Serveurs isolés fournis par root sur21999/8799 ; ne pas redémarrer ceux d’un autre travail. `PANEL=snapshots|collaborators MODE=empty|long|recovery LABEL=... node probe.cjs`. Géométrie indépendante des brouillons : SKIP_DRAFT=1 ; contrepreuve purement DOM : COUNTERPROOF=1. Pour le build réellement corrigé, ne pas utiliser COUNTERPROOF.

## Validation finale root

La règle a été appliquée sur une branche locale distincte après f96, sans modifier la tête840. Buildclient/SSR réussi ;70gardesCSS et16tests inventaire passent. Recette `PANEL=collaborators MODE=long SKIP_DRAFT=1 LABEL=compiled-collaborators node probe.cjs`, sans COUNTERPROOF :390/820/1280 passent. Revue indépendante favorable. Aucun changementTypeScript ; typage complet de la basef96 conservé, non réexécuté pour ce deltaCSS. Le lintSCSSglobal comporte deux différences préexistantes horsdelta, non reformattées. Ce lot est local, non livré ; brouillonCollaborators resteincidentdistinct.
