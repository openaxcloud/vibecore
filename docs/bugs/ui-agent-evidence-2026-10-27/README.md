# Complément Agent : preuves de fichiers et de sortie modèle

Préparation locale pour une PR distincte de #811, sans publication par cet agent.

## Sources et intégration

Le build testé correspond au commit local `9e4c9c719`, intégrant main `0d6b2edfbfa1a3bcf7ef17d8e7a18b7b6f8d3209` (#811 fusionnée) et le contrat backend #812 final. Le delta produit reste limité à six fichiers UI. [source.json](source.json) conserve leurs empreintes.

Le seul conflit de merge concernait les imports de BaseChat : l'import Settings de #811 et le lecteur de reçu ont été conservés ensemble. Settings, tooltips, Escape et navigation de main sont préservés. La [revue indépendante](validation/independent-review.md) n'a identifié aucun blocage d'intégration. Aucune modification de backend, permission, écriture runtime ou publication.

## Résultats locaux

- [54 tests ciblés](validation/tests.txt) : 32 UI existants, 12 écarts de livraison, 8 registre de confirmations et 2 pureté des imports.
- [Typage officiel](validation/typecheck.txt) : application web, scripts, helpers IDE, Electron et 31 packages verts.
- [Build client/SSR](validation/build.txt) : code 0.
- [Lint global](validation/lint-global.txt) : code 0, zéro erreur et 52 avertissements.
- [Index dérivé](validation/index-tests.txt) : six tests verts ; 529 fiches au moment de cette préparation. Une première invocation avec le runner Node au lieu de Vitest a échoué avant exécution ; elle ne constitue pas un défaut produit.

Ces résultats précèdent tout éventuel regroupement avec le correctif de défilement préparé par une autre session. Ils ne le valident pas.

## Nouvelle recette navigateur du build courant

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
SOURCE_SHA=$(git rev-parse HEAD) node docs/bugs/ui-agent-evidence-2026-10-27/harness/browser.cjs
```

Utiliser des processus séparés et des ports libres. Le garde réseau est chargé **avant** le serveur : seuls les fetch serveur vers la fixture locale sur le port 8199 sont autorisés. La fixture refuse toute méthode autre que GET. Le navigateur bloque les tiers, WebSockets et mutations HTTP ; `/api/chat` est traité uniquement en mémoire. Les fichiers de harness ne sont pas des mocks du produit.

Les processus de cette recette ont été arrêtés après vérification de leurs identités ; [cleanup.json](validation/cleanup.json) confirme leur disparition et les ports fermés.

## Limites

Pas de navigation SPA entre projets, recette fournisseur, permission réelle, sauvegarde cloud, compilation de projet généré ou QA attestée. Pas de nouvelle matrice mobile/zoom/Safari dans cette recette sémantique. Le signal streaming est global au composant : l'alerte est différée tant qu'il reste actif. La relecture runtime est une observation historique ; le registre borné peut revenir à l'état inconnu après éviction ou changement de projet. Aucune CI de la future PR, fusion ou livraison de ce complément n'est revendiquée.
