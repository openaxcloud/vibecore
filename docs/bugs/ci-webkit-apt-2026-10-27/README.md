# Préparation APT du canari WebKit

Publication d’une PR CI séparée prévue et autorisée ; commit local préparé pour le parent. Pas de fusion autorisée dans cette étape, aucun job actif interrompu. Base main `0d6b2edfbfa1a3bcf7ef17d8e7a18b7b6f8d3209`.

## Constat

Le job 122264543142 a consommé44 min 38 s dans « Install Playwright browsers » avant annulation : APT téléchargeait encore Get 171 depuis azure.archive.ubuntu.com. Aucun test WebKit n’avait démarré dans cet extrait. Les intervalles des gros paquets suggèrent environ35–40kB/s, sans constituer une mesure réseau instrumentée. La cause ultime du débit (miroir, réseau, proxy) reste inconnue. [Log terminal](canary-attempt1-timeout.txt).

Les reprises sur erreur n’aident pas un transfert lent qui continue. Le cache Playwright couvre les binaires, pas les paquets APT. Les listes de dépendances Chromium/WebKit restent définies par la CLI install-deps, pas par une sélection manuelle réduite.

## Changement proposé

L’action commune ajoute une étape uniquement pour l’entrée `chromium,webkit` sur X64 ; son autre appelant reste Chromium. Sur Ubuntu x86_64, un script remplace seulement les URI exactes du miroir Azure connu par l’archive Ubuntu officielle en HTTPS. Il reconnaît mirrorlist, sources.list et deb822 URIs, préserve commentaires, signatures, suites, composants, security.ubuntu.com et dépôts tiers. Exécution idempotente ; hôtes/chemins différents inchangés. Aucun paquet, délai, assertion, scénario ni comportement de reprise modifié. Aucun `/etc` local modifié pendant la validation.

La solution ne garantit pas le débit futur. L’image Docker officielle Playwright contient les bibliothèques système, mais migrer cette pile exigerait de valider Docker Compose, localhost, Node 22 et version exacte Playwright 1.59.1 ; ce changement plus large n’est pas inclus. Aucun timeout arbitraire ne tue dpkg. Le traitement historique advisory d’un échec binaire WebKit demeure inchangé, dette distincte.

## Validation et restant

- [32 tests/4 fichiers verts](tests-32.txt) :8 nouveaux miroirs,8 dépendances,9 cache,7 bornes canari.
- [8 cas rejoués](tests-portable-8.txt) après suppression de l’écriture bytecode dans le harness. Ces8 cas sont inclus dans les32, pas 40 tests distincts.
- Fixtures temporaires, architecture simulée x64/ARM ; pas de skip ni dérogation produit. Aucune installation APT réelle.
- ESLint ciblé, Prettier ciblé, syntaxe Python et diffcheck : sortie 0. Gardes index exécutées lors du commit documentaire, reçu séparé.
- [Revue indépendante favorable](independent-review.md), [empreintes des 3 fichiers](source-hashes.json).

Après publication par le parent : vérifier sur CI réelle miroir effectivement changé, durée APT, démarrage WebKit et verdict des tests. Aucun gain ni réparation du canari certifié avant ces mesures. État main/live non validé pour ce correctif.

## Sources officielles

[Ubuntu — gestion des paquets](https://ubuntu.com/server/docs/how-to/software/package-management/) décrit sources.list et deb822. [Playwright — Docker](https://playwright.dev/docs/docker) documente l’image avec navigateurs/dépendances système, et [Playwright — CI](https://playwright.dev/docs/ci) les installations Linux. Documentation consultée le 27 octobre 2026 ; ses versions illustratives ne remplacent pas 1.59.1 épinglée ici.

Les copies de logs conservent leur contenu ; les lignes vides finales ont été normalisées pour le contrôle whitespace du dépôt.
