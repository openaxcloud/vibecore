# Entrées compte/offre et compatibilité : contrats et fixtures

Worktree isolé `vibecore-ui-entry-next`, base `b72c48322a245d72be501a252809f0d844638a28`. Source produit et tête PR#800 inchangées. Application12399 sert en lecture seule le build existant safecontent UI975 + intégration main, sans nouvelle compilation. Fixture API6499 dédiée ; variables SAAS_API_URL/API_BASE_URL explicites. Précharge Node refuse fetch hors de cette API et toute méthode autre que GET. Navigateur bloque tiers, WebSocket, mutations et GET sensibles (export/checkout/portal/OAuth). Pas de fournisseur ou paiement réel.

Le dénominateur est **5 IDs alias +8 IDs compatibilité**, pas13 pages rendues indépendantes. Les destinations des alias ont leur propre UI et ne sont pas ajoutées comme nouvelles routes à ce dénominateur. Deux valeurs d’état sont choisies pour `$slug` et `advanced.$section` ; donc10 états compatibilité, sans prétendre couvrir toutes les valeurs dynamiques.

| Module | URL synthétique | Contrat source/HTTP |
| --- | --- | --- |
| account-data | /account-data | 301→/account-settings/data |
| connected-accounts | /connected-accounts | 301→/account-settings/connected |
| onboarding | /onboarding?lang=fr | 302→/dashboard?lang=fr ; langue normalisée seulement |
| subscribe | /subscribe?plan=team&interval=yearly | 302→/upgrade?plan=team&interval=annual ; GET ne souscrit pas |
| user.settings | /user/settings | 301→/account-settings |
| $ | /synthetic-missing/deep/path | 404, route catch-all réellement identifiée |
| $slug | /synthetic-missing et /home | 404 inconnu ;200 surface connue |
| advanced.$section | /advanced/synthetic-missing et /advanced/mobile | 404 inconnu ;200 surface connue |
| marketing.$slug | /marketing/synthetic-missing | 404, réexport du module$ mais ID propre |
| profile.$username | /profile/synthetic-user | 404 levée par loader |
| u.$username | /u/synthetic-user | 404 levée par loader |
| u.$username.$projectname | /u/synthetic-user/synthetic-project | 404 levée par loader |
| user.$username | /user/synthetic-user | 404 levée par loader |

Les preuves HTTP sans suivi et `window.__reactRouterDataRouter.state.matches` sont séparées. Le second reçu confirme10 états associés exactement aux8 IDs compatibilité : une404 seule ne prouve pas l’identité de la route. `/home` n’est pas assimilé à l’IDE, seulement à sa surface marketing. Les profils404 ne sont pas des redirections et ne sont pas retirés comme non-UI.

## Contrats API locaux

Fixture6499 : utilisateur/organisation synthétiques, catalogue free/pro/team local, abonnementACTIVE, projets/invitations vides, coût0, préférences/notifications vides ; compte sans suppression programmée ; connexions et alertes vides. `/auth/me`, `/orgs`, `/orgs/synthetic-entry-org/{billing,projects,invitations,ai/cost-summary}`, `/billing/synthetic-entry-org`, `/user/{preferences,notifications}`, `/account/deletion`, `/api/account/{connections,reconnection-alerts}`, `/auth/connections` reçoivent chacun leur payload propre. GET non configuré→404 ; toute mutation→405 ; aucune transmission externe. Fichier de pannes dédié, aucun changement des fixtures partagées.

## Plan de recette et limites

Cinq formats :320×900,390×844,844×390 paysage,820×1180,1440×900 ; FR/EN×clair/sombre. Navigation et redimensionnements successifs sur chaque état, mesures document et éléments ciblés, Tab/Escape puis Retour natif vers une page locale sentinelle. Les alias sans conservation de query reçoivent la langue déjà établie par la sentinelle locale ; la langue DOM est consignée. Aucune action métier des destinations activée.

Captures FRclair320 et844 pour inspection ciblée, pas toutes langues/thèmes inspectées visuellement. Pas de zoom200%, contraste calculé, lecteur d’écran, clavierOS, safearea physique, Safari/Firefox ou production. Les formulaires métier des destinations, liens OAuth, abonnement et export ne sont pas exercés. Les états connus des deux résolveurs sont un échantillon, pas l’ensemble de leurs catalogues.
