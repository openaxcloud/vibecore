# Deux pertes d’interaction reproduites dans l’IDE — 18 octobre 2026

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
