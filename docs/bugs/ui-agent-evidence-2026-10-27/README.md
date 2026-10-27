# Complément Agent : preuves de fichiers et de sortie modèle

## Correction du glossaire après la première CI de #819

La tête `76c6b3ce` a échoué au garde `app/lib/i18n/runtime-glossary.spec.ts:34` : deux nouveaux libellés français contenaient le terme non traduit « runtime ». Les 10 547 autres tests unitaires ont passé, quatre étaient ignorés ; les étapes intégration/build de Production CI ont été ignorées après cet échec. Ce résultat n'est pas présenté comme une validation complète.

Les deux libellés utilisent maintenant « dans l’environnement d’exécution ». Aucune assertion, garde, clé, valeur de confirmation ou logique n'a changé. Revue indépendante favorable : état inconnu, confirmation par relecture et absence de preuve cloud/compilation/QA préservés.

Après correction : 64 tests réussis dans huit fichiers (les 63 tests du lot commun et le garde du glossaire), lint ciblé, formatage et `git diff --check` réussis. Le build et les captures ci-dessous restent ceux du code précédent : ils n'ont pas été rejoués pour ces deux traductions. La nouvelle tête doit passer ses propres validations CI avant fusion.

Préparation locale pour une PR distincte de #811, sans publication par cet agent. Les copies de logs ont uniquement leurs espaces de fin de ligne et lignes vides finales normalisés.


## État final du lot commun

Code testé : `d8cc81e7e`, comprenant les six fichiers UI de preuve et le correctif de défilement `90f928fc9` (hook et test), sur main #811 `0d6b2edfb`. La tête finale pourra contenir un commit documentaire supplémentaire ; il ne change pas ce code. [Empreintes des huit fichiers](consolidated-source.json).

- [63 tests ciblés](validation-consolidated/tests.txt) et [six contrôles d'index](validation-consolidated/index-tests.txt) verts ; index à 530 fiches.
- [Typage officiel complet](validation-consolidated/typecheck.txt), dont 31 packages, et [build client/SSR](validation-consolidated/build.txt) : code0.
- [Lint global](validation-consolidated/lint-global.txt) : zéro erreur, 52 avertissements préexistants.
- [Nouvelle recette du build commun](browser-integrated/receipt.json) : les huit états Stop ci-dessous sont rejoués, plus trois parcours sur le vrai transcript compilé à1440×1000,EN,clair. Remontée normale, resize immédiat et scroll natif+resize : top0 reste conservé après1200ms ; le bouton apparaît et son clic rejoint la zone de bas (écart mesuré de2px). Le conteneur passe de550 à480 puis410px, tandis que du texte et un nouveau reçu modèle long arrivent pendant le flux. [Capture intégrée](browser-integrated/integrated-scroll.png).
- Zéro pageerror.14 tentatives réseau navigateur bloquées :6GET tiers et8mutations (5POST,3PUT). Aucun appel fournisseur ; le garde serveur strict est chargé avant l'application. Les404/503 de fixtures restent visibles et ne sont pas présentés comme un runtime sain.
- [Preuves isolées de défilement](scroll/README.md) : neuf tests et douze cas Chromium provenant de la session propriétaire, distincts des trois parcours du build commun. L'installation WebKit refusée403 n'a pas été retentée ; aucune preuve Safari/iOS ou explication causale du flaky CI.

Les [processus du passage commun](validation-consolidated/cleanup.json) ont été arrêtés après vérification d'identité. Revue indépendante du code commun favorable ; revue des preuves documentaires conservée dans [independent-review.md](validation-consolidated/independent-review.md). Aucun résultat de CI, merge ou production du complément n'est revendiqué.

## Étape précédente : six fichiers UI sans correctif de défilement

Le build testé correspond au commit local `9e4c9c719`, intégrant main `0d6b2edfbfa1a3bcf7ef17d8e7a18b7b6f8d3209` (#811 fusionnée) et le contrat backend #812 final. Le delta produit reste limité à six fichiers UI. [source.json](source.json) conserve leurs empreintes.

Le seul conflit de merge concernait les imports de BaseChat : l'import Settings de #811 et le lecteur de reçu ont été conservés ensemble. Settings, tooltips, Escape et navigation de main sont préservés. La [revue indépendante](validation/independent-review.md) n'a identifié aucun blocage d'intégration. Aucune modification de backend, permission, écriture runtime ou publication.

## Résultats précédents sur9e4c9c719

- [54 tests ciblés](validation/tests.txt) : 32 UI existants, 12 écarts de livraison, 8 registre de confirmations et 2 pureté des imports.
- [Typage officiel](validation/typecheck.txt) : application web, scripts, helpers IDE, Electron et 31 packages verts.
- [Build client/SSR](validation/build.txt) : code 0.
- [Lint global](validation/lint-global.txt) : code 0, zéro erreur et 52 avertissements.
- [Index dérivé](validation/index-tests.txt) : six tests verts ; 529 fiches au moment de cette préparation. Une première invocation avec le runner Node au lieu de Vitest a échoué avant exécution ; elle ne constitue pas un défaut produit.

Ces résultats précèdent le regroupement avec le correctif de défilement. Ils ne le valident pas ; les résultats consolidés sont indiqués plus haut.

## Recette préalable sur9e4c9c719

[Reçu des huit états](browser/receipt.json), Chromium local, viewport de 1440 × 1000, EN ; captures en thème clair. Le vrai BaseChat et son bouton Stop sont ceux du build de production local. Le flux `/api/chat` est synthétique : une `Response`/`ReadableStream` injectée dans le navigateur, au format réellement consommé par le SDK. Aucun fournisseur ou projet client n'est appelé.

1. Nouveau tour sans reçu : Stop agent.
2. Sélection de Claude par fallback sans reçu : Stop agent.
3. Reçu textuel pertinent de Claude : Stop Claude.
4. Dernier reçu de continuation d'un autre modèle : Stop agent.
5. Reçu Claude pour un autre message ignoré : Stop agent.
6. Nouveau tour après l'historique précédent : Stop agent.
7. Après un nouveau reçu Claude, Stop puis effacement via le menu et sa confirmation : le tour suivant reste neutre et l'ancienne notice disparaît.
8. Navigation complète vers un second projet synthétique : nouveau tour neutre.

[Capture du reçu](browser/receipt-stop.png) et [état après Stop](browser/after-stop.png). Zéro erreur JavaScript non interceptée dans le reçu final. Douze tentatives réseau navigateur ont été bloquées, y compris les mutations automatiques de conversation/ide-state et les ressources tierces : il ne faut pas annoncer zéro tentative. Les GET non configurés provoquent des réponses 404/503 et une erreur visible de mémoire IDE ; ce harness ne valide ni le chargement des fichiers ni le runtime.

Ces huit cas sont nouvellement exécutés sur ce build. Les huit cas historiques du 26 octobre, dont les fichiers temporaires ont disparu, ne sont pas comptés ni présentés comme preuves disponibles.

## Reproduction isolée

Depuis la racine du dépôt, après installation existante et build :

```sh
node docs/bugs/ui-agent-evidence-2026-10-27/harness/fixture.cjs
PORT=18199 HOST=127.0.0.1 API_BASE_URL=http://127.0.0.1:8199 SAAS_API_URL=http://127.0.0.1:8199 node --require ./docs/bugs/ui-agent-evidence-2026-10-27/harness/network-guard.cjs node_modules/@react-router/serve/bin.js build/server/index.js
SOURCE_SHA=$(git rev-parse HEAD) UI_CHECK_SCROLL=1 UI_RECEIPT_DIR=/tmp/ui-agent-receipt node docs/bugs/ui-agent-evidence-2026-10-27/harness/browser.cjs
```

Utiliser des processus séparés et des ports libres. Le garde réseau est chargé **avant** le serveur : seuls les fetch serveur vers la fixture locale sur le port 8199 sont autorisés. La fixture refuse toute méthode autre que GET. Le navigateur bloque les tiers, WebSockets et mutations HTTP ; `/api/chat` est traité uniquement en mémoire. Les fichiers de harness ne sont pas des mocks du produit.

Les processus de cette recette ont été arrêtés après vérification de leurs identités ; [cleanup.json](validation/cleanup.json) confirme leur disparition et les ports fermés.

## Limites

Pas de navigation SPA entre projets, recette fournisseur, permission réelle, sauvegarde cloud, compilation de projet généré ou QA attestée. Pas de nouvelle matrice mobile/zoom/Safari dans cette recette sémantique. Le signal streaming est global au composant : l'alerte est différée tant qu'il reste actif. La relecture runtime est une observation historique ; le registre borné peut revenir à l'état inconnu après éviction ou changement de projet. Aucune CI de la future PR, fusion ou livraison de ce complément n'est revendiquée.
