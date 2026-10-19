# IDE : deux pertes d’interaction et une lecture de style périmée — 18 octobre 2026

Ces observations établissent deux défauts locaux. Elles n’attribuent pas encore
les échecs de main #736/#737 ou de la PR #738 à ces mécanismes. Aucune
assertion, durée maximale ou exemption existante n’est assouplie.

## Palette perdue au remplacement de la coque

[Preuve locale et captures](mesures/2026-10-18-palette-handoff-local.json) :
une vraie réponse HTTP `ide-state` 200 est retenue, la palette ouverte dans
la coque provisoire, puis la réponse délivrée intacte. Les anciens nœuds
sont démontés ; le nouveau bouton est fermé et la palette absente. Une
réouverture fonctionne. Huit sources du build existant sont identiques à
`c421` ; le retard de livraison est imposé, pas mesuré en CI.

La correction validée localement déplace l’état éphémère d’ouverture/recherche
au-dessus des coques, avec portée projet/fenêtre, fermeture explicite et
suppression de l’état en quittant le projet. Une nouvelle régression réelle
échoue sur l’ancien build après remplacement confirmé du nœud. Sur le build corrigé `4cce474b`, la régression et le cas historique de style
passent : deux cas Chromium, zéro retry, captures avant/après inspectées.
Le typage web avec TypeScript 5.8.3, le lint et le build client/SSR passent.
[Preuve et limites](mesures/2026-10-18-palette-handoff-fixed-local.json),
[capture avant](captures/2026-10-18-palette-fixed-before-handoff.png) et
[capture après](captures/2026-10-18-palette-fixed-after-handoff.png).
Aucun déploiement ni validation Safari/mobile n’est revendiqué.

## Bouton de reprise sans effet pendant un chargement

[Contre-épreuve du wrapper et du transport](mesures/2026-10-18-panel-retry-local.json) :
après le seuil existant de sept secondes, le bouton « Réessayer » est actif,
mais son clic laisse une seule requête HTTP, sans annulation. Un remontage
partage encore cette même requête. Seule la libération de la réponse initiale
permet de sortir du chargement.

Le test exécute par extraction AST le code inchangé du wrapper et de ses
primitives, avec les vrais hooks React/jsdom et un serveur HTTP loopback.
Les enfants de contenu sont des points de substitution explicites ; aucune
base de données réelle, route Remix complète ou preuve CI n’est impliquée.
Le serveur est fermé et aucun socket ne subsiste après l’expérience.

La correction proposée conserve la promesse logique partagée par projet et
panneau. Une reprise explicite remplace sa tentative HTTP ; les consommateurs
suivent la nouvelle tentative, et une ancienne réponse tardive ne doit pas
écraser son résultat. Sur `88979697`, 40 tests ciblés passent, dont le
wrapper réel sur HTTP loopback, ses deux consommateurs et son remontage.
Les contre-épreuves sans annulation ou sans garde d’identité redeviennent
rouges. Le typage web TypeScript 5.8.3 et le lint passent. L’annulation
client ne garantit pas que les travaux SQL/amont s’arrêtent. Cette correction
ne change pas le délai du premier affichage du titre DB et ne prouve pas
la cause du rouge CI. Les deux correctifs sont réunis pour validation
sur main `43eef614`, sans modifier délais, assertions ni exemptions existants.

## Lecture de style sur un nœud détaché — preuve locale

Le premier navigateur du lot intégré `0b8ae254` donne un cas vert et un
rouge : la nouvelle régression de handoff passe en 19,2 s, mais le cas
historique de styles lit un rayon vide au lieu de `12px`. La capture montre
pourtant une palette ouverte. Ce rouge est conservé.

Six observations bornées ajoutent uniquement des métadonnées synchrones au
callback historique, avec assertions, délais et zéro retry inchangés :
trois rouges et trois verts en 1,7 min. **Chaque rouge reçoit un nœud
`isConnected=false`, rayon vide ; au même instant, le menu courant est
connecté et son rayon vaut `12px`.** Les trois verts lisent le nœud courant.
[Mesures exactes](mesures/2026-10-18-style-detached-local.json) et
[capture de l’observation 0 inspectée](captures/2026-10-18-style-detached-palette-visible.png).
Les six projets QA ont été supprimés avec HTTP 200 ; zéro processus actif
possédé et ports locaux fermés. Ce n’est pas une relance jusqu’au vert.

La sélection du nœud par `Locator.evaluate` et son évaluation passent par
deux appels Playwright distincts ; le remplacement de coque peut intervenir
entre eux. Une lecture atomique, qui sélectionne et mesure le menu courant
dans le même callback navigateur, est désormais validée localement. Les assertions de
style restent identiques ; un menu absent ou un vrai CSS incorrect doivent
toujours être détectés. Cette preuve attribue le rouge **local** observé,
pas les anciennes exécutions CI dont les captures restent inaccessibles.

## Limites du diagnostic DB

Le titre DB est rendu sans condition dans la vue racine du Workbench ; le
wrapper peut le masquer pendant son propre chargement. Le catalogue des
tables n’est demandé qu’après sélection d’une base, donc les 128 tables du
PostgreSQL QA ne sont pas à elles seules une explication du titre absent.
La réponse initiale attend plusieurs lectures API en parallèle ; leur
latence n’a pas été mesurée dans le shard rouge.

L’exécution ciblée instrumentée 39170180476 rapporte 45 cas uniques, zéro
échec persistant et un cas de menu mobile passé après une nouvelle tentative.
Les deux cas DB passent au premier essai dans chacun des quatre jobs. Les
six exemptions configurées ne correspondent à aucun cas de ce rapport ciblé.
Aucune métadonnée d’échec DB n’est donc obtenue. Le run complet instrumenté
39171191591 conserve l’ordre original des fichiers et termine à 22:30:58 UTC :
453 rapportés, zéro échec persistant, deux instabilités, six exemptions
inchangées et 73/73 fichiers. Les deux cas DB passent au premier essai.
[Résultat exact](mesures/2026-10-18-mobile-db-diagnostic-full-result.json) :
aucune métadonnée d’échec DB n’est obtenue, et la cause reste inconnue.
Ce run précède les corrections UI ; son résultat ne prouve pas leur effet.

## Validation du lot intégré — 23:00 UTC

Sur `6365455b6`, avec les quatre sources produit identiques au build de
`93e7e3d8`, les deux cas Chromium passent sans retry : styles historiques
16,2 s, handoff et contre-épreuves 27,9 s (49,4 s au total). Le lecteur
observe bien `13px` après la mutation locale puis `12px` après restauration ;
il rejette le menu absent après Escape. Les captures avant/après sont inspectées.
Les trois projets ont reçu DELETE 200, le wrapper termine avec code 0,
zéro processus actif possédé et ports 3301/3173 fermés.

[Preuve intégrée et empreintes](mesures/2026-10-18-ide-recovery-integrated.json) :
88 tests ciblés distincts passent (72 + 16 générateur), six contrôles d’index
rejoués après régénération, typage web TS 5.8.3, typage ciblé des tests,
build client/SSR et aucun nouveau diagnostic lint. Le fichier dashboard
conserve ses six erreurs et un avertissement historiques ; nouveaux fichiers
sans diagnostic. Le build n’est pas rejoué après la seule correction des
tests : ses entrées produit sont comparées octet pour octet.
Aucune cause CI ou validation production n’est ajoutée par ces succès locaux.


## Vérifications complémentaires et premier refus CI — 23:16 UTC

La [PR #740](https://github.com/openaxcloud/vibecore/pull/740) rassemble le
lot sur `f2af72cb4`. Deux cas DB réels passent également localement à
390×844, sans retry, en 23,5 s ; mêmes assertions et API/PostgreSQL QA réels.
Les captures sont inspectées et les deux projets ainsi que leurs liaisons
DB supprimés avec HTTP 200. [Mesures et limites visuelles](mesures/2026-10-18-ide-recovery-mobile-local.json) :
la barre de requête « Mes données » reste serrée et son libellé Running
partiellement rogné. Ces succès ciblés ne reproduisent ni n’expliquent la
panne CI. Aucune validation Safari ou HTTPS public n’en est déduite.

La première CI de #740 échoue au typage : le test navigateur ajouté dans
`scripts/` entre dans le projet NodeNext sans DOM. Sa correction le déplace
vers `tests/ci/`, conserve ses 18 cas et ajoute un projet DOM strict
obligatoire au wrapper de typage. Le projet Node existant, le nouveau projet
DOM et les 18 tests passent localement ; aucun contrôle existant n’est
retiré. La validation du nouveau SHA reste nécessaire.
[Premier refus et correction locale](mesures/2026-10-18-pr740-first-head.json).

Les trois builds Desktop du même SHA échouent séparément au téléchargement
d’Electron 42.0.0 depuis npmmirror.com, HTTP 504, après compilation du
renderer et du processus principal. Aucun paquet Desktop produit ni cause
UI/DB déduite de ces échecs de téléchargement.


Le premier E2E complet de #740 termine à **23:26:28 UTC** : 454 cas
rapportés, zéro échec persistant, zéro instabilité, six exemptions existantes.
Les styles historiques passent en 7,0 s, le handoff en 12,8 s et les deux
cas DB en 24,2 s / 24,8 s, tous au premier essai. Les quatre audits EN/FR
passent ; WebKit compte 17 succès et trois sauts existants. Aucune nouvelle
métadonnée d’échec DB n’est produite : la cause historique reste inconnue.
La première tête reste refusée par le typage et les téléchargements Desktop ;
la correction de typage `88d683c4d` doit passer ses propres contrôles.


## Blocage Desktop distinct — 23:37 UTC

Sur `133c8ecc0`, le typage complet passe en CI. Le téléchargement Electron
reproduit toutefois le HTTP 504 du miroir npmmirror sur Linux et Windows ;
macOS est encore en build à ce relevé. Ce miroir imposé depuis 2025 est
retiré du YAML pour revenir à la source officielle prévue par le résolveur.
Les métadonnées de la release confirment les trois archives exactes. Le
reste du YAML est comparé égal, les builds locaux main/preload, le smoke
test existant et six contrôles d’index passent.
[Preuve et limite cryptographique](mesures/2026-10-18-desktop-mirror.json).

Cette correction de configuration reste dans #740. Son push remplace la
tête dont la CI et les E2E sont encore en cours ; aucun résultat terminal
vert n’est attribué à ces exécutions incomplètes. La nouvelle tête doit
passer tous les contrôles requis. Le résultat complet de `f2af72cb4` reste
conservé séparément. Le packaging officiel n’est pas encore prouvé.

## Résultats de `af2badd` et correction des tests — 23:58 UTC

Le retrait du miroir permet maintenant les trois builds Desktop et leurs
uploads sur Windows, macOS et Linux. Aucune release ni installation utilisateur
n’est déduite de ce résultat. La tête intermédiaire `133c8ecc0` avait bien
échoué sur les trois téléchargements HTTP 504 ; sa CI et son E2E ont été
annulés par la correction de configuration, sans verdict vert revendiqué.
[Résultats intermédiaires](mesures/2026-10-18-pr740-intermediate-result.json).

L’E2E de `af2badd` termine à 23:56:39 UTC : 454 cas, zéro échec persistant,
une instabilité iPhone Pro Max et six exemptions inchangées, 74/74 fichiers.
Les deux cas DB passent dès leur première tentative en 13,7 s et 15,6 s ;
aucune nouvelle métadonnée d’échec DB n’est produite. Les quatre audits EN/FR
passent et WebKit compte 17 succès / trois sauts existants.

La CI reste refusée par deux tests, après typage complet réussi. La suite
Retry ne se charge pas : la configuration Vite racine remplace `node:util`
par un polyfill navigateur dépourvu de `transferableAbortController`. Le
rouge est reproduit localement avec cette configuration, sous le même Node
24 que les essais locaux précédents ; la différence Node 22/24 n’est donc
pas la cause établie. `createRequire` charge désormais le module Node natif.
Le corps des tests HTTP/abort/cache reste identique. Le garde de style
historique exigeait une balise sur une ligne et `loadPanel()` ; il accepte
les espaces et exige maintenant explicitement `loadPanel({ retry: true })`,
tout en conservant le variant danger et les exclusions Tailwind.

Les **110 tests distincts de onze fichiers passent avec la configuration
racine réelle**, zéro saut, en 26,55 s. L’ancienne validation avec une
configuration minimale n’avait pas détecté le polyfill. Les contre-épreuves
du garde refusent un mauvais variant et l’absence de `retry: true`.
[Refus CI, corrections et preuves](mesures/2026-10-18-pr740-ci-test-harness.json).
Ces changements concernent les tests ; les quatre sources produit web et
le build navigateur sont inchangés. Les contrôles du nouveau SHA restent requis.

Un essai Chromium mobile du vrai bouton Retry a également réussi sur API et
PostgreSQL QA réels. La première réponse HTTP 200 est retenue intacte ; le
bouton relance une deuxième requête, annule la première dans le navigateur,
puis affiche la vraie base et ses 128 tables. La libération tardive de la
première réponse ne retire pas le panneau affiché. Les trois captures sont
inspectées ; projet et liaison DB supprimés HTTP 200, aucun processus actif
possédé restant. [Mesures et captures](mesures/2026-10-18-panel-retry-browser-local.json).
Ce délai contrôlé ne mesure ni n’explique la panne CI ; l’annulation navigateur
ne prouve pas l’arrêt du travail SQL en amont. Aucun accès production n’est acquis.
