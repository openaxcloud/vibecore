# Recette finale du build commun P2 — 12699

Source du build commun : `222495dda`, worktree parent public-admin, en lecture seule. Aucun build supplémentaire. Chromium local, API réelle non utilisée, toutes les requêtes non GET et externes bloquées.

## Résultats distincts

| Groupe | Routes réellement visitées | Observations de redimensionnement | Parcours ciblés |
|---|---:|---:|---:|
| Correctifs | 4 | 160 | 4 groupes signalement + 8 ancres froides |
| Routes restantes | 11 | 440 | 4 groupes lien interne et Retour |

Les dix formats sont 320×900,360×900,390×900,844×390,768×1024,820×1180,1024×768,1280×900,1440×900 et1920×1080, chacun en FR/EN et clair/sombre. Les thèmes réellement appliqués ont été relevés. Chaque URL est chargée une fois par langue/thème puis redimensionnée : ce ne sont pas600 chargements froids ni600 parcours complets. Le mapping exact des quinze identifiants de routes est dans route-mapping.json ; aucun alias hérite automatiquement de ces preuves.

## Quatre routes corrigées

/dpa, /student-dpa, /report-abuse et /subprocessors ont un unique repère main contenant h1 dans160 observations. Les160 contrôles documentaires mesurés ont leurs fragments de texte Range contenus dans leurs contours ; hauteur réelle44 à86px. À820/1440, le min-height calculé vaut0px à cause de md:min-h-0, mais la hauteur réelle mesurée est46px : aucune conclusion déduite des seules classes.

Le libellé Word français intégral se replie sur trois lignes à320px. La cascade compilée du dernier delta wrap est désormais vérifiée. Le groupe radio possède son nom accessible ; flèches, Escape et brouillon conservé pendant resize320→844→1440→320 sont exercés dans quatre groupes, sans soumission.

Les huit chargements froids StudentDPA (FR/EN, thèmes,320/1440) contiennent la cible dans le HTML et placent le titre sous le header. Aucune erreur JS, aucun POST tenté, aucune assertion en échec.

## Onze routes nouvellement exercées

/acceptable-use, /accessibility, /commercial-agreement, /data-deletion, /deleting-your-data, /enforcement, /licensing, /security, /strike-system, /trust-and-safety, /usage-limits :440 observations, un main par page, aucun débordement détecté sur les éléments montés examinés dans main. Le lien /acceptable-use→/security et le Retour navigateur sont exercés dans quatre groupes. Cela ne certifie pas tous les liens, tous les états, ni toutes les interactions des onze pages.

## Tableau et examen visuel

Les colonnes hors viewport du tableau Subprocessors se trouvent dans un wrapper horizontal défilable. Quatre contre-vérifications à320px montrent que le focus du lien de détail défile le wrapper et rend le lien entièrement visible ; aucune activation externe. Les douze observations avec colonnes hors viewport ne sont donc pas présentées comme un clipping confirmé. Voir table-probe.json.

Deux captures FR clair320 (DPA et StudentDPA) ont été réellement inspectées par final_review : labels, icônes et contours lisibles, aucun clipping apparent sur cet échantillon. Cette revue favorable ne prétend pas inspecter visuellement les600 observations ni calculer un ratio WCAG.

## Limites et nettoyage

136 demandes de feuilles Google Fonts bloquées dans les deux matrices : rendu avec polices locales de repli. Pas de messagerie ouverte, téléchargement, compte, vraie API, donnée réelle, signalement, mutation backend, achat ou ressource payante. Pas de nouveau zoom200%, WebKit, contraste quantitatif, clavier virtuel matériel, validation juridique ou recette production. Les mesures géométriques portent sur les éléments montés ; ce n'est pas une certification de toute la plateforme.

Tous les navigateurs sont fermés. Serveur12699 arrêté après vérification PID/startTicks ; SIGTERM puis SIGKILL du résiduel possédé, /proc absent et connexion refusée confirmés dans cleanup.json. Aucun autre processus touché. Logs archivés avec espaces de fin de ligne normalisés, originaux dans /tmp/ui-legal-p2-final.
