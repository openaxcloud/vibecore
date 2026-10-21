# Revue et recette combinée #750 / #753

Preuve locale uniquement, 21 octobre 2026. Aucun merge, déploiement, compte réel, appel fournisseur ou modification des quotas. Aucun panneau complet certifié.

## Sources et builds

Main : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`. #750 reste `e996671e600322a5c5df8f70f4ad8f4cfe766707`. #753 initiale : `c8c871c2585f13238cc02775b64e285b080202c4`. Le worktree combiné ajoute uniquement le HeaderOverflowMenu de #750 aux sources produit de #753 et aux corrections de cette revue. Les archives compilées sont conservées dans `/workspace/ux-artifacts/`, hors Git ; leurs manifestes complets relient chaque source suivie et fichier compilé à son empreinte. Le [manifeste complet](full-build-source-manifest.json) publie les 4 980 empreintes de sources et 2 304 empreintes compilées, uniquement avec des chemins relatifs ; le [reçu de comparaison](comparison-receipt.json) vérifie l’absence de fichier manquant et l’unique substitution HeaderOverflowMenu depuis #750. Il s’agit d’une comparaison locale, pas d’une réattestation indépendante du build. Le fichier `version.json` donne les empreintes finales (port 5203) ; `version-all-width.json` identifie les preuves menu/quota intermédiaires sur 5202. Une comparaison de toutes les sources produit avec le checkout final ne trouve que HeaderOverflowMenu, intentionnellement pris à #750. Ne pas servir un build pendant sa reconstruction. Pour rejouer une archive, l’extraire dans un dossier isolé et lancer react-router-serve avec ce dossier comme cwd : assetsBuildDirectory vaut build/client, relatif au cwd. Pointer seulement vers un autre build/server/index.js depuis le cwd d’un build différent mélange les ressources. La tentative sur 5200 avait ce défaut de banc ; aucun résultat produit n’en est tiré.

## Corrections de l'interprétation initiale

- `e2e-combined.txt` mobile FR : clic intercepté par ProductTour, aucune justification pour l'attribuer au pool PostgreSQL.
- `e2e-mobile-fr-limit.txt` : création HTTP 201, attente du nouveau bouton Restaurer dépassée **avant** `page.reload()`. Cette recette historique reste incomplète.
- Les anciennes captures après annulation prouvent le focus DOM ; la capture mobile FR montre aussi une occlusion. Les nouvelles assertions utilisent `elementFromPoint` pour vérifier le centre du bouton dans le viewport.
- Le test initial utilisait le nom `desktop` pour choisir le clavier. Le projet CI `chromium` n'avait pas de toucher et aurait exécuté `.tap()`. Le choix repose maintenant sur `project.use.hasTouch`, avec vérification de `navigator.maxTouchPoints`.
- Première correction ProductTour limitée à <=1199px : insuffisante. `standard-first.txt` montre une interception à 1280×720 en EN, FR passant. La correction finale réserve l'espace à toutes les largeurs.

## Matrice des gestes

| Geste | Preuve | Résultat / limite |
| --- | --- | --- |
| Avant : Créer focalisé mais couvert, mobile FR | `tour-before.txt`, JSON et capture | Reproduit, hit-test false |
| Créer avec visite ouverte, retrouver Restaurer, annuler, focus visible | `tour-intermediate.txt`, captures `tour-after-*` | Réussi à 390×844 sur build intermédiaire ; focus et centre non recouverts |
| Suivant/Retour, Plus tard, rouvrir, fermeture, recharger | même recette | PATCH préférences réels 200 ; instantané persisté ; espace réservé retiré à la fermeture |
| Défilement tactile interne sur écran court, atteindre Plus tard | `tour-scroll.txt`, capture | Réussi 390×320 : scrollTop 29 sur contenu 277 / hauteur 248 ; PATCH 200 |
| Profil standard chromium après correction toutes largeurs | `standard.txt` | Deux cas réussis EN/FR sur build intermédiaire ; `standard-final.txt` confirme 2/2 sur la version finale |
| Trois formats × FR/EN après correction toutes largeurs | `formats-first.txt`, `formats-isolated.txt` | Première passe 4/6 ; tablette FR et mobile FR bloqués avant formulaire par API 500. Reprise : tablette FR passe ; mobile FR révèle un focus encore recouvert. `formats-final.txt` confirme ensuite 6/6 sur la version finale, sans changer assertions ni budgets |
| Menu #750 + Dialog #753, annulation sans effacer la conversation | `menu-combined.txt`, JSON, captures | Huit gestes FR/EN réussis sur build toutes largeurs ; aucune suppression |
| Quota réel, FR/EN, nombre d'instantanés inchangé | `quota-real.txt`, JSON, captures | Deux 429 réels, message quotaExceeded visible FR/EN, cinq instantanés avant/après |

## Reproduction

Installer les dépendances du lockfile. Préparer PostgreSQL local dédié sur `127.0.0.1:55443`, base `vibecore_ux_20261021`, appliquer les migrations du dépôt. Les scripts `api.ts.txt` et `snapshot-*-fixtures.ts.txt` utilisent le store réel ; les copier sous `.vibecore/ux-qa/` en retirant `.txt` pour conserver leurs imports relatifs. Fournir DATABASE_URL uniquement pour cette base synthétique et lancer avec le runner TypeScript du dépôt. Le bootstrap vérifie la cible, refuse production, interdit les appels HTTP sortants hors loopback et l'envoi d'email. Il génère des sessions temporaires de deux heures dans des fichiers mode 0600 ; ne pas les publier. Chaque scénario dispose d'une organisation et d'un projet vides, avec quotas normaux. Aucun mock réseau. Les archives vides de ces projets ne valident pas la restitution de fichiers métier.

Construire les sources combinées avec `npm run build` puis servir le build immuable :

```sh
HOST=127.0.0.1 PORT=5203 SAAS_API_URL=http://127.0.0.1:3013 NODE_ENV=production node_modules/.bin/react-router-serve build/server/index.js
```

Le fichier racine `playwright.ux-audit.config.ts` est la configuration exacte : mêmes budgets 30s/test et 5s/assertion que le dépôt, un worker, zéro retry, aucune réponse interceptée. Mode standard : profils du dépôt conservés (notamment chromium Desktop Chrome sans toucher), seul le binaire Chromium système et le serveur compilé déjà lancé changent.

```sh
UX_STANDARD_CONFIG=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium PLAYWRIGHT_BASE_URL=http://127.0.0.1:5203 SAAS_API_URL=http://127.0.0.1:3013 UX_QA_SESSION_FILE="$PWD/.vibecore/ux-qa/snapshot-standard-sessions.json" node_modules/.bin/playwright test -c playwright.ux-audit.config.ts --project chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium PLAYWRIGHT_BASE_URL=http://127.0.0.1:5203 SAAS_API_URL=http://127.0.0.1:3013 UX_QA_SESSION_FILE="$PWD/.vibecore/ux-qa/snapshot-final-sessions.json" node_modules/.bin/playwright test -c playwright.ux-audit.config.ts
```

Sauvegarder `.vibecore/ux-qa/review-results*` entre les deux passes ; Playwright nettoie ce dossier. Exécuter les recettes complémentaires en série, sans reconstruire le build servi. Les scripts de preuve conservent parfois le port du build intermédiaire ; utiliser le port du manifeste correspondant.

## API et limites

Pendant `standard-first`, vingt sondes réelles donnent /health 200 (maximum 243ms), /ready 200 (maximum 1,366s), dix connexions PostgreSQL idle, sans preuve de fuite. `combined-probes.json` conserve temps UTC, charge et états de connexions. L'API utilise main ; elle n'a pas l'instrumentation archive de #752. Le diagnostic serveur de saturation volontaire explique un mécanisme de timeout, pas la cause de chaque lenteur précédente. Ne pas conclure à une correction API.

Une autre erreur API est désormais isolée : contrainte unique `organizationId` dans `enterpriseOrganizationSettings.upsert()` à prisma-store.ts:4177. Le journal `api-errors-sanitized.json` conserve les request IDs, dont `769140ed-defc-4615-9e8b-f27748a61688` et `6e45e13c-7e54-4ae5-8e83-4f64d9e40421`. Elle bloque les cas FR avant le formulaire. Des lectures ultérieures sans mutation répondent 200 sur les mêmes projets ; cela autorise une reprise isolée, sans effacer l'échec initial ni revendiquer une correction serveur.

Le quota est distinct : `assertQuota` → code `QUOTA_EXCEEDED` conservé dans enterprise-api.server → ancien `actionError` ne gardant que 429 → texte rateLimited. La route conserve désormais le code ; les catalogues FR/EN expliquent le quota atteint. Les autres 429 gardent le message de limitation temporaire. Aucun quota modifié.

Dépendances : BaseChat/Monaco et PendingComposerShell à recetter avec le lot éditeur ; pas de restauration effective ni d'effacement réel pendant ces essais. Lecteurs d'écran, WebKit, production et autres consommateurs de ConfirmationDialog non certifiés. Les 17 tests de route et 12 de ProductTour sont complémentaires, pas des preuves navigateur.

## CI de la tête initiale

#750 e996671e : 28 succès, 2 skipped, tous terminés à la lecture de 08:27 UTC. #753 c8c871c2 : échec Install/test/build/scan et Quality Gates. L’annotation GitHub prouve le défaut propre à ce lot : identifiant de frontmatter absent dans BUG-UX-CONFIRMATION-FOCUS-001.md ; corrigé avec les deux nouvelles entrées, contrôle d’index 6/6 vert. Le téléchargement des journaux GitHub Actions reçoit 403 ; aucun contournement. D’autres annotations correspondent aux scénarios négatifs des tests, elles ne suffisent pas à diagnostiquer un incident production. La CI de la prochaine tête reste à consulter après publication.

## Verdict final local

Build final `3ce63e8e60bcbd4a4315f562c89835ae9849c49f3b2a45665b01e1e566196eb4` : six cas FR/EN × desktop/tablet/mobile réussis en 33,5s ; deux cas standard chromium réussis en 24,3s. Création, affichage, rechargement, confirmation, boucle Tab/Shift+Tab, annulation clavier/toucher, focus DOM **et hit-test visible**, Escape et absence de requête de restauration sont conservés. Les échecs historiques ne sont pas réécrits en succès.

`tour-final.txt` et captures `tour-final-*` prouvent sur cette même version : création avec visite ouverte, focus visible avant/après Annuler, Suivant/Retour, Plus tard et fermeture. Après chaque PATCH réel, un GET de préférences confirme productTour.status=dismissed ; l'instantané reste après rechargement. `tour-scroll-final.txt` répète le geste tactile à 390×320 (scrollTop 29) et Plus tard. Aucun force-click, interception réseau, délai ajouté ou désactivation de visite pour masquer un obstacle.

`quota-final.txt` répète les deux vrais 429 sur la version finale et conserve cinq instantanés avant/après. La session synthétique initiale ayant expiré (401 confirmé), cette passe utilise la fixture review-mobile-fr déjà existante et valide. Elle avait trois instantanés, la recette de visite en crée un quatrième puis la préparation quota en crée un cinquième via le vrai formulaire, avec affichage vérifié. Aucun quota augmenté ou exempté, aucun nouveau credential fournisseur.

31 tests ciblés de la version finale passent (`unit-final.txt` : 12 ProductTour, 13 route i18n/erreurs, 6 index). Typecheck complet et lint passent (`commit-validation.txt`, 51 avertissements existants, zéro erreur). Le premier hook avait rejeté le typage JSON du quota ; une garde de forme explicite l'a corrigé, puis le build et les tests réels ont été repris. Le build obsolète interrompu n'est pas utilisé comme preuve.

La course API est documentée dans [BUG-API-ENTERPRISE-SETTINGS-RACE-001](../../BUG-API-ENTERPRISE-SETTINGS-RACE-001.md) avec requêtes, request IDs, pile et dates PostgreSQL. Elle provient du chargement produit parallèle après préparation des fixtures, pas d’une préparation concurrente partageant une organisation. Sa correction appartient au chantier serveur.
