# Contrat vignette — lecture seule main951

Source exacte : `951ceb8d5653bee4df30b010753c859c0c4a44c0`. Extraits dans ce dossier obtenus avec git show ; le worktree principal est plus ancien. Aucun appel réseau/service, test exécuté, modification produit, lecture .env ou secret.

## Contrats et limites constatés

- `services/api/src/app.ts:36891–36908` : POST refresh exige projects:write et une URL valide. Stockage désactivé ou capturer sans URL : 202 scheduled:false/enabled:false. Sinon 202 scheduled:true/enabled:true dès schedule(), sans résultat de capture.
- `services/api/src/thumbnail-capture.ts:45–47,54–78,129–140` : enabled signifie uniquement SCREENSHOTTER_URL présent. Maps/Set par instance en mémoire ; déduplication par projet cinq minutes, réservation avant capture, inFlight. Un échec consomme donc aussi la fenêtre. Aucun job durable ni déduplication inter-réplicas dans ce service. schedule ne retourne pas de promesse observable au client.
- `thumbnail-capture.ts:80–125` : fetch screenshotter avec signal 30 s, puis stockage de bytes non vides sous thumbnails/preview.png. Le signal ne borne pas putObject ; 30 s ne garantit pas une fin de pipeline. Une capture ignorée/échouée ou encore en cours est compatible avec scheduled:true.
- `services/api/src/object-storage.ts:365–424,516–543` : GET liste le bucket existant et signe une lecture, sans ensureBucket. putObject écrit dans le bucket existant sans le créer. Bucket absent est donc une condition possible d’échec de capture ; configuration active ne suffit pas.
- `services/api/src/app.ts:36799–36880` : GET exige projects:read quand stockage actif ; vérifie objet exact avant URL signée. Absence de bucket/objet ou délai =>404. `storage-deadline.ts:17,27–47` : budget 5 s pour lecture/signature, promesse GCS non annulée. Aucun GET ne déclenche une capture. Un objet existant peut être ancien : GET ne prouve pas la fraîcheur d’un refresh.
- `app/routes/api.projects.$projectId.thumbnail.ts:10–46` : proxy GET transforme absence/404 en204 private,no-store ; objet présent =>302 URL signée. Auth/autres erreurs conservées. Succès de la lecture PNG reste distinct du302.
- `app/routes/api.projects.$projectId.thumbnail.refresh.ts:12–36` : proxy POST répond200 ok:true avec scheduled/enabled repris, pas202. HTTP ok seul ne signifie pas disponibilité.
- `app/components/workbench/Preview.tsx:1443–1456` : déclenche une fois par baseUrl ajoutée au Set avant fetch ; ne lit ni statut ni JSON, ne notifie pas la carte de fin de stockage. Lecture seule : aucun changement Preview proposé ici.

## Screenshotter

`services/screenshotter/src/app.ts:55–82,86–158` : file FIFO locale, concurrence par défaut2, pas de déduplication projet. Bearer vérifié si secret configuré ; URL HTTP(S), garde domaines/DNS fail-closed ; refus401/400/403, page HTTP>=400 =>422, autre panne rendu502. Une allowlist vide refuse toutes les captures. `browser.ts:216–242` : navigation load (15 s par défaut), pause1,5 s, PNG viewport non fullPage ; pas d’attente explicite de stabilité métier de la preview. Service sans écriture GCS : celle-ci appartient à l’API.

Noms de configuration seulement : OBJECT_STORAGE_ENABLED ; SCREENSHOTTER_URL ; SCREENSHOTTER_SHARED_SECRET (cohérent entre API/service lorsqu’utilisé) ; SCREENSHOTTER_ALLOWED_HOSTS ; SCREENSHOTTER_NAV_TIMEOUT_MS ; SCREENSHOTTER_SETTLE_MS ; SCREENSHOTTER_PREVIEW_PROXY_URL ; SCREENSHOTTER_MAX_CONCURRENCY ; SCREENSHOTTER_WIDTH ; SCREENSHOTTER_HEIGHT ; SCREENSHOTTER_PORT ; NODE_ENV ; OBJECT_STORAGE_BUCKET_PREFIX. Stockage résolu via ADC/Workload Identity (`object-storage.ts:633–651`) : bucket existant et droits lecture/écriture/signature nécessaires. Aucun état effectif de configuration ou droits en production vérifié.

## Retry client envisageable, sans modification ici

GET borné est compatible avec le contrat en lecture seule : conserver le repli, limiter quelques tentatives espacées, dédupliquer par projet, suspendre hors écran et annuler au démontage/changement de projet. Ne pas boucler sur chaque onError. Arrêter sur refus auth lorsqu’il est observable ; 204 ne distingue pas feature off, absence et stockage lent. Limiter la concurrence : les lectures sous-jacentes continuent après leur délai. Une fenêtre bornée peut manquer une capture tardive ; aucun succès garanti. Une ancienne vignette peut être lue sans prouver le nouveau refresh.

Ne pas ajouter automatiquement des POST refresh : exigent projects:write, déclenchent rendu et écriture ; répéter dans cinq minutes peut être ignoré, même après échec. enabled/scheduled doivent être interprétés, et aucune API de statut de job n’est fournie par ce contrat. À coordonner avec le propriétaire Preview/backend avant évolution.

## Tests existants identifiés, non exécutés

- `services/api/src/thumbnail-capture.spec.ts` : cinq cas stockage, désactivation, debounce, échec absorbé, schedule sans rejet.
- `services/api/src/tests/vignette-stockage-coupe.spec.ts` : trois cas désactivation202 et contrôles d’accès.
- `app/routes/api.projects.$projectId.thumbnail.spec.ts` : cinq loaders GET (302/204/auth/erreurs/id absent) et trois actions upload distinctes.
- `app/routes/api.projects.$projectId.thumbnail.refresh.spec.ts:42,55,64` : transmission URL, URL absente400, ancien backend404 désactivé.
- `services/screenshotter/src/app.spec.ts` : sept cas contrat/auth/garde/erreur/health ; `error-pages.spec.ts` : quatre cas404/500/502/type erreur. Autres suites présentes : browser-egress.spec.ts, browser-egress.real.spec.ts, egress-proxy.real.spec.ts, runtime-startup.spec.ts ; présence inventoriée, aucune recette attribuée.

Conclusion : manque client plausible = carte en repli avant stockage asynchrone, sans notification ni nouvelle lecture. Ce diagnostic de contrat ne prouve pas la cause d’une vignette réelle manquante : configuration inactive, capture refusée, bucket absent, preview indisponible et stockage défaillant restent possibles. Aucune action cloud ou production effectuée.
