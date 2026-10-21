# Recette commune UX / éditeur — 21 octobre 2026

## Périmètre et version exacte

Banc local synthétique, sans déploiement ni fusion de PR. Assemblage :

- main `4e79230ccfd63cb9562b88ffe9b8fe911f0bcb28` ;
- #749 `e41a39790776bbcd910cba2b19a9ac33a7b7f439` ;
- #750 `e996671e600322a5c5df8f70f4ad8f4cfe766707` ;
- complément menu fourni par l’éditeur, SHA-256 `78f27a505f94a2e0b15c716674635a60cc24bd42eda58dab0acebb87bd0ef9ac` ;
- #753 `cef42091af8525a1d07ea06b7f70f953d69b0740`.

[Manifeste complet](full-manifest.json) : **5 023 sources, zéro différence imprévue**, 2 306 fichiers compilés. Build SHA-256 `2fd5c14211537d998558da154d9ff128855ee182b86e6ff41ba8c36583ad8b4d`. [Reçu de l’archive](build-receipt.json), conservée localement sans gros binaire ajouté au dépôt. Dépendances installées hors ligne avec lockfile figé ; `@vibecore/editor` résout dans le checkout commun, pas dans un ancien checkout.

Arbre Git du build : `f31f6d5b0b8bd60b619c0aa70abdd80e2323b4ee`. Arbre après la correction de mesure du test : `5f5ca94ae24d2b387b4e5fd07b62ffccd47fb3f5`. [Comparaison](test-correction.json) : **aucune différence produit**, seulement une assertion préalable de fin de transition dans le test menu. Ces identifiants sont des arbres Git locaux, pas des commits d’intégration publiés.

Le patch menu est récupéré depuis le [commentaire de l’éditeur](https://github.com/openaxcloud/vibecore/pull/749#issuecomment-6314860079), vérifié par SHA-256, puis appliqué. Son en-tête de diff pour la route IDE cite un blob préparatoire ancien : [reconstruction indépendante](menu-patch-reconstruction.json) sur #749 + HeaderOverflowMenu exact #750, puis patch, **sept fichiers identiques au checkout commun**. Aucun remplacement de route par une ancienne version, aucune optimisation abandonnée reprise.

[Union de l’inventaire](inventory-union.json) : **462 entrées**, sans perte. Les deux conflits documentaires DB/palette conservent à la fois le correctif décrit par #749 et le diagnostic antérieur #753, identifié comme historique. La branche #750 seule conserve son union avec main ; la combinaison complète demeure distincte.

## Résultats

| Groupe | Verdict | Preuve |
| --- | --- | --- |
| 45 cas historiques mobile/IDE, y compris les deux SQL réels | **45/45**, 351,5 s, zéro retry/omission/flaky | [résultats](mobile45-results.json), [gate](mobile45-gate.txt) |
| Chargement DB, continuité menu et palette FR/EN ouvert/fermé | **10/10**, 83,5 s, zéro retry/omission | [résultats](loading-summary.json) |
| Fenêtres flottantes, réancrage, navigation et langue, desktop/768/390 | **4/4**, 84,2 s, zéro retry/omission | [résultats](floating-summary.json) |
| Menu/dialogue, trois formats FR/EN, mesure initiale | **16/18**, deux rouges conservés | [premier passage](formats-first-summary.json) |
| Même matrice après correction de synchronisation du test | **18/18**, 118,2 s, zéro retry/omission | [passage corrigé](formats-settled-summary.json) |
| Profil standard chromium, sans tactile | **6/6**, 45,8 s, zéro retry/omission | [résultats](standard-summary.json) |
| Publication, trois formats FR/EN | **6/6**, aucune erreur initiale de visibilité | [actions et réseau](publication-publication-matrix.json) |
| Menu : clic extérieur, sortie de focus, Shift+Tab, annulation | **8/8** | [résultats et provenance](menu-results.json) |
| Visite guidée mobile, création/annulation/fermeture/persistance | **réussi** | [actions](tour-actions.json) |
| Visite guidée 390×320, geste tactile réel | **réussi**, scrollTop 29 | [défilement](tour-scroll.json) |

Build et typecheck global réussis. [46 tests ciblés](unit.txt) réussis ; [lint](lint.txt) : 0 erreur, 52 avertissements. L’avertissement supplémentaire par rapport au lot précédent est une fonction vide dans la route ide-panel apportée par #749 ; aucune règle de lint modifiée. Les contrôles de compilation sont terminés avant les recettes navigateur ; un seul worker et une seule recette navigateur active à la fois.

## Correction de la mesure tactile, sans changement produit

Deux échecs : hauteur visuelle 43,4305 px au lieu de 44 juste après un appui, sur tablette FR et mobile EN. La première sonde retrouve 44 px au repos. La [sonde du geste](nav-transition-instrumented.json) observe une hauteur CSS de 44 px, mais une hauteur visuelle de 43,945 px avec `CSSTransition` de transform en cours, puis 44 px, transform none et aucune animation. Le CSS existant applique scale(0.95) pendant l’appui, avec transition de 150 ms.

Le test ajoute `await expect(agent).toHaveCSS('transform', 'none')` avant l’assertion de hauteur **strictement inchangée** `>= 44`. Budget standard existant, aucun timeout ajouté, aucun délai fixe, aucune tolérance, aucune désactivation d’animation. [Script de mesure exact](nav-transition-probe.cjs), [reçu de modification](test-correction.json). Le premier rouge n’est pas effacé ; les 45 autres cas n’ont pas été relancés, leurs sources et le produit n’ayant pas changé.

La mise à jour de #750 qui porte ces preuves synchronise main et ajoute cette assertion ; elle ne modifie pas le composant produit du menu. Le complément de continuité du menu reste un patch distinct fourni par l’éditeur, effectivement inclus dans le build testé.

## Effets vérifiés et captures

DB FR/EN : **une requête initiale et une seule requête de liste**, réponse réellement obtenue conservée inchangée, carte ouverte et **129 tables** de PostgreSQL synthétique affichées ([preuve](database-response-evidence.json)). Captures [attente FR](database-fr-pending.png), [données FR](database-fr-ready.png), [attente EN](database-en-pending.png), [données EN](database-en-ready.png). Les champs susceptibles de contenir la connexion sont masqués dans ces captures ; aucune valeur de connexion n’est publiée.

Menu et annulation FR : [desktop](menu-desktop-fr.png), [tablette](menu-tablet-fr.png), [mobile](menu-mobile-fr.png) ; focus après annulation [desktop](cancel-desktop-fr.png), [tablette](cancel-tablet-fr.png), [mobile](cancel-mobile-fr.png). Le menu bas mobile est conservé. Les autres captures restent dans les résultats locaux.

Publication : le déploiement FAILED persistant et son journal sont [réutilisés depuis le cas 41](publication-origin.json), sans nouvelle publication. BFF 200, texte entièrement dans le bouton supérieur, absence de débordement, focus et hit-test, cibles tactiles vérifiées, ouverture et fermeture du journal par les deux boutons. [Mobile FR](publication-publication-after-390-fr.png), [tablette FR](publication-publication-after-768-fr.png), [desktop FR](publication-publication-after-1440-fr.png).

Tour : création avec visite ouverte, contrôle entièrement visible et recevant les événements, annulation sans restauration, Suivant/Retour, Plus tard, réouverture/fermeture et rechargement. Les préférences sont écrites puis relues par l’API réelle. Le scénario court utilise de véritables événements tactiles ; aucun statut de visite n’est forcé par la fixture.

## Reproduction et limites

API locale sur 3016, frontend compilé sur 5209, PostgreSQL synthétique dédié sur 55443. Six identités synthétiques existantes sont réutilisées avec de nouvelles sessions temporaires ; quotas normaux, aucune clé fournisseur. Les paramètres enterprise des fixtures sont initialisés séquentiellement : cette recette ne valide pas la course enterpriseOrganizationSettings transmise séparément au chantier API. Les anciens serveurs de recettes terminées sont arrêtés ([relevé](superseded-processes.json)), sans suppression de données ni d’archives.

Après assemblage des références, utiliser les configurations publiées avec #753, le Chromium système et les fixtures privées autorisées :

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5209 SAAS_API_URL=http://127.0.0.1:3016 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium UX_QA_AUTH_FILE="$PWD/.vibecore/ux-qa/integration-auth-pool.json" node_modules/.bin/playwright test -c playwright.mobile-gate-audit.config.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5209 SAAS_API_URL=http://127.0.0.1:3016 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium UX_QA_SESSION_FILE="$PWD/.vibecore/ux-qa/integration-sessions.json" UX_INTEGRATION_REPORT_DIR=/tmp/common-formats node_modules/.bin/playwright test -c playwright.combined-ux-audit.config.ts
```

La connexion PostgreSQL locale autorisée doit aussi être présente dans DATABASE_URL pour les cas SQL. Le profil standard ajoute UX_STANDARD_CONFIG=1 et `--project chromium`, dans un dossier de résultats séparé. Les fichiers exacts [loading-handoff.config.ts](loading-handoff.config.ts) et [floating-common.config.ts](floating-common.config.ts) sont à placer sous `.vibecore/ux-qa/` dans le checkout assemblé, puis à passer à `playwright test -c` avec les mêmes variables. Ils conservent les budgets et zéro retry.

Scripts exacts : [publication](publication-actions.cjs), [menu](menu-combined.cjs), [tour](tour-after.cjs), [défilement](tour-scroll.cjs). Pour publication, fournir PLAYWRIGHT_BASE_URL, UX_QA_OUTPUT_DIR et UX_QA_SESSION_FILE pointant vers la session privée du déploiement existant. Les scripts tour/menu s’exécutent depuis le checkout commun. Le script menu avait encore trois SHA statiques hérités dans son champ sources, alors que ses endpoints visaient correctement 5209/3016. Le [résultat brut avec ces anciennes étiquettes](menu-original-labels.json) est conservé ; [la provenance corrigée](menu-results.json) provient du manifeste du build servi, sans modification des huit résultats.

[Erreurs API observées](api-errors-observed.json) : mémoire non configurée (503) et schéma de la connexion nommée non joignable du test d’affichage (500). Elles restent distinctes des SQL réels réussis. Les tests voix/streaming conservent leurs doubles existants : aucune validation de fournisseur réelle revendiquée. Les quatre cas flottants vérifient leurs gestes et effets ; ils ne certifient pas tout l’éditeur. La plateforme et les panneaux ne sont pas déclarés entièrement certifiés.

Les anciens 43/45, 16/18 et essais de publication incomplets restent des preuves historiques distinctes. Aucun transfert de traces 403 retenté. Aucune fusion, aucune validation production ; les checks requis de la nouvelle tête #750 et l’intégration coordonnée du patch menu restent nécessaires.
