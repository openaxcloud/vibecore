---
id: BUG-PUBLIC-TELEMETRY-INVENTED-001
section: "2026-10-18 — Vérification avant commercialisation"
---

# BUG-PUBLIC-TELEMETRY-INVENTED-001 — Statut et métriques publics sans source

## Bug

P1 — Sur la base `1d2755086f5d05d41c1d12739dcfd230a1a99044`, les loaders publics rendent des services opérationnels, 99,99 % de disponibilité, latences, compteurs et benchmarks constants sans observation. `/status` affiche tous les systèmes opérationnels et sept jours sans incident à partir d'un tableau vide. Les tests existants consacrent ces valeurs. Le fichier statique hérité `/ecode-static/index.html` charge aussi un ancien client dont les fallbacks inventent des chiffres.

## 📤 Dispatché

☑ — 18/10/2026, correction isolée demandée par le parent.

## 💻 Codé

☐ — travail local ; ni fusion ni livraison.

## ✅ Testé live

☐ — aucune preuve de production ; accès production non utilisé.

## Preuve et périmètre

Régression API : `app/routes/api.public-telemetry.spec.ts`. Périmètre : état, disponibilité, historique, monitoring public, santé et benchmark polyglot ; sans créer de backend de télémétrie. RAG, catalogue de capacités, autres statistiques marketing et sondes internes hors périmètre. La page et ses métadonnées doivent annoncer l'absence de mesures en EN/FR ; l'abonnement existant et les liens restent utilisables.

## Contrat du correctif local

- `/api/status` et `/api/status/services` conservent les identifiants et descriptions du catalogue, mais chaque service porte `status: unknown`, `telemetryAvailable: false`, `observedAt: null` et des mesures nulles. HTTP 503, `Cache-Control: no-store`, message EN/FR et code `PUBLIC_TELEMETRY_UNAVAILABLE`.
- `/api/status/{incidents,maintenance,metrics,uptime}`, `/api/polyglot/{health,benchmark}` et `/api/monitoring/health` rendent le même refus explicite. Historique, maintenance, compteurs, latences, disponibilité, résultats de benchmark et dates d'observation sont inconnus (`null`), jamais remplacés par zéro, une liste vide ou l'heure de la requête. `total_services` compte uniquement les six descriptions du catalogue.
- HTTP 503 signifie ici **télémétrie indisponible**, pas panne démontrée de la plateforme. Les sondes Helm `/health` et `/ready` ne sont pas ces adaptateurs publics et restent inchangées.
- `/status` reste une page HTTP 200 avec état inconnu et historique indisponible en EN/FR. Plus de calendrier synthétique « aucun incident », badge animé de bonne santé, promesse de surveillance ou reprise garantie. Les métadonnées sont cohérentes. Les liens et le formulaire `/newsletter` restent ; son texte décrit une inscription aux actualités, sans promettre des alertes automatiques d'incident.
- L'ancien index est redirigé avant les couches statiques par Node et Vite, et avant le chargement de l'application dans l'adaptateur Pages. Les règles Pages couvrent les chemins usuels ; les variantes normalisées/encodées sont testées dans les adaptateurs. Images, CSS et bundles dérivés restent intacts. Le helper est copié dans l'image Docker. `server.mjs`, le helper et `public/` sont inclus dans les deux cartes web existantes ; les contrôles de release et le drapeau V2 ne sont pas modifiés.

## Contre-épreuves et limites

Les 20 nouveaux cas API échouent sur le code de base (`/tmp/vibecore-status-red.log`). Une vraie requête HTTP contre Express+public établit que `//ecode-static/index.html` et `///ecode-static/` rendaient encore l'ancien HTML malgré la première redirection ; ces deux cibles rendent ensuite 302 (`/tmp/vibecore-status-redirect-leading-slash-{red,green}.log`). Les variantes de slash inversé ont été vérifiées en requêtes HTTP brutes ; aucune ne sert l'ancien index après correction.

La contre-revue a reproduit quatre autres accès à l'ancien HTML combinant slash et segment relatif encodés : `/ecode-static%2f.%2findex.html`, `/ecode-static/%2e%2findex.html`, `/ecode-static%2f..%2fecode-static%2findex.html` et `/%65code-static%2f.%2findex.html`. Le helper normalise désormais les segments après décodage, comme le service statique. Les quatre requêtes HTTP brutes rendent 302 et `no-store` ; les assets image et CSS restent identiques octet pour octet (`/tmp/vibecore-status-redirect-dot-segments-{red,green}.log`, tests `legacy-marketing-entry.spec.mjs`).

Quatre nouveaux cas prouvent aussi l'oubli du serveur/helper/public dans la détection des tiers, avec un changement runtime concomitant : quatre rouges avant correction (`/tmp/vibecore-status-tier-red.log`). Le harnais existant exécute le vrai shell de détection dans un dépôt jetable, avec une réponse GitHub instrumentée uniquement pour le test ; aucune construction cloud n'est lancée.

L'ancien index était servi avec `max-age=1h`. Les nouvelles réponses HTTP sont corrigées, mais aucune copie déjà en cache ni page déjà ouverte n'a été purgée ; pas de prétention de retrait instantané dans les navigateurs existants. Les anciens bundles ne sont pas régénérés : leur source/générateur n'a pas été trouvé. Leur point d'entrée servi est fermé, leurs assets restent nécessaires aux pages natives.

WebKit n'est pas installé. Le téléchargement officiel Playwright vers `/tmp/vibecore-status-browsers` a été refusé par le proxy (HTTP 403 « Domain forbidden » sur ses CDN), sans contournement ; journal `/tmp/vibecore-status-webkit-install.log`. Aucun résultat Chromium ne vaut preuve Safari/iOS. L'adaptateur Pages et ses règles sont vérifiés localement seulement ; aucune exécution sur Cloudflare, aucun déploiement et aucune mesure live.

## Validation locale du 18 octobre 2026

Les validations suivantes portent sur les sources corrigées dans le worktree isolé, initialement fondé sur `1d2755086f5d05d41c1d12739dcfd230a1a99044` ; elles ne constituent ni CI, ni fusion, ni preuve de production.

- Vitest : **146/146 tests, 12 fichiers, zéro skip**, un worker, 51,77 s ; `/tmp/vibecore-status-tests-final.log`. Couverture des neuf contrats API EN/FR, page et métadonnées, catalogue i18n, consommateurs préservés, vraie couche statique HTTP, adaptateur Pages local, packaging, tiers et index documentaire.
- Typecheck web : `tsc --project tsconfig.web.json --noEmit --pretty false`, code 0, aucun diagnostic ; `/tmp/vibecore-status-typecheck.log`. Build officiel `pnpm run build`, code 0 ; `/tmp/vibecore-status-build.log`. Mémoire mesurée avant les suites lourdes ; pic observé pendant le build environ 11,49 Go sur 16 Gio. Aucune suite SQL lancée.
- ESLint différentiel : les 17 fichiers JS/TS modifiés ont zéro erreur et zéro avertissement ; `/tmp/vibecore-status-eslint-final.json`. Cela ne qualifie pas le lint global du dépôt. `i18n:check` passe avec la baseline existante (21 résidus historiques dans quatre fichiers), `/tmp/vibecore-status-i18n.log`.
- Chromium sur le vrai serveur Node issu du build : six pages `/status` HTTP 200 en EN/FR aux largeurs 1440, 768 et 390 ; six badges inconnus, historique indisponible, aucune erreur JavaScript ni débordement horizontal. Le formulaire d'abonnement s'ouvre au clic/toucher, conserve ses champs et son action, sans soumission. Dix-huit appels API rendent 503 et neuf entrées héritées rendent 302. Aucun compte ni fournisseur connecté ; douze requêtes externes bloquées par le harnais.
- Captures inspectées après chargement explicite de l'illustration lazy : `/tmp/vibecore-status-captures/`, avec `evidence.json` et `/tmp/vibecore-status-browser.log`. Reproduction : `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/check-public-status-local.mjs http://127.0.0.1:3184 /tmp/vibecore-status-captures`, serveur local uniquement. Le script n'envoie aucun formulaire.

La contre-revue indépendante n'a trouvé aucun P0/P1 restant dans ce périmètre après fermeture des variantes d'URL reproduites. Restent à établir : CI du commit de livraison, fusion, déploiement, observations réelles sur les domaines servis, Safari/iOS et comportement de l'edge Cloudflare. Le correctif annonce honnêtement l'absence de télémétrie ; il n'apporte pas une télémétrie de disponibilité ni une preuve de capacité commerciale de la plateforme.

## Livraison indépendante de la correction runtime

La branche a été replacée sur `main` **`44a8e01bc1010732cb5862c346071e4411d0511d`**, avec un seul commit propre au présent correctif ; elle n'embarque pas la PR #735. Comparaison avant/après rebase : **19 fichiers source et tests identiques par SHA-256**, et patch identique de la seule ligne de détection web dans `deploy-main.yml`. Le workflow complet retrouve naturellement les contrôles de cette base, sans importer ceux de #735. Le seul conflit, l'index des bugs, a été résolu par `node scripts/migrer-inventaire-bugs.mjs --index` : 428 entrées, sans fusion manuelle. Preuves locales : `/tmp/vibecore-status-pre-rebase-sha256.json` et `/tmp/vibecore-status-rebase-proof.json`.

Après rebase, **103/103 tests ciblés, six fichiers, zéro skip**, un worker, 37,64 s : API EN/FR, redirections HTTP et Pages, détection des tiers et index ; `/tmp/vibecore-status-tests-post-rebase.log`. ESLint des mêmes 17 fichiers : zéro erreur et zéro avertissement, `/tmp/vibecore-status-eslint-post-rebase.json`. Aucun build supplémentaire : le build, typecheck et les captures ci-dessus restent ceux exécutés avant rebase, sur des sources web identiques. Ils ne sont pas présentés comme un build de la nouvelle base complète. Aucun push, aucune PR, aucune fusion ni activation effectués par cette session.
