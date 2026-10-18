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
