# Navigation Domains → Publish : recette locale du 25 octobre 2026

**Six cas navigateur passent sur le build compilé corrigé**, en 115,83 s, avec zéro retry, omission ou flaky. API, PostgreSQL et stockage sont réels ; les comptes/projets sont synthétiques et isolés. Ce lot ne publie aucun projet et ne modifie aucun DNS. Il ne certifie pas la production.

## Contre-épreuve et cas validés

La contre-épreuve utilise en lecture seule l'artefact compilé du lot précédent #784, pas une nouvelle compilation de `main`. À 390 px, `?panel=domains` rend correctement l'ancien formulaire Domains autonome, mais aucun hôte ni sous-onglet Publish : la garde canonique échoue après 60 s. Ce n'est pas une page blanche. [Avant](before-mobile-domains.png) · [après](after-mobile-domains.png).

| Cas final | Résultat | Preuve |
|---|---|---|
| URL historique `?panel=domains`, 390 px | Publish → Domains et notice organisation ; Logs reste choisi après passage desktop | [Capture](after-mobile-domains.png) |
| Même URL, 1440 px | Même parcours ; Logs reste choisi après passage mobile | [Capture](domains-url-1440.png) |
| Signet `/projects/:id/domains` | Redirection vers IDE Domains après authentification réelle du projet | [Capture](domains-bookmark.png) |
| Ancien panneau `domains` sauvegardé via API | Identité d'onglet conservée, hôte commun ; Manage survit au passage 1440→390→1440 | [Capture](domains-persisted-pane.png) |
| Publish sur projet non publié | Ouvre la configuration ; valeurs avancées conservées après repli/réouverture ; aucune mutation tentée | [Capture](publish-advanced-options.png) |
| Ancien formulaire POST document | `invalid/path` reçoit HTTP 400 et une erreur visible ; liste réelle des domaines inchangée ; lien de retour ouvre la section canonique | [Capture](legacy-post-validation-error.png) |

Le dernier cas fabrique un formulaire HTML ancien dans le navigateur pour simuler une page déjà ouverte avant mise à jour. Son POST atteint réellement l'application et l'API. Le schéma rejette le nom invalide **avant** création d'un domaine ou recherche DNS. Les fixtures de layout sont sauvegardées par un vrai PUT API et relues avant ouverture, sans interception de données.

Les captures mobile, configuration avancée et erreur historique ont été inspectées visuellement. [Reçu expurgé](receipt.json) : SHA des sources, empreinte du manifeste de 2 305 fichiers compilés, aucun écart source/build après recette. Les traces et journaux bruts restent privés : ils peuvent contenir des sessions synthétiques.

## Reproduction

Test versionné : `tests/e2e/deploy-canonical-navigation.spec.ts`. Depuis la racine du dépôt installé, avec une pile locale dédiée et un navigateur Playwright installé :

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5198 \
SAAS_API_URL=http://127.0.0.1:3017 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
node_modules/.bin/playwright test tests/e2e/deploy-canonical-navigation.spec.ts \
  --project=chromium --workers=1 --retries=0
```

La recette documentée utilisait Chromium système `/usr/bin/chromium` dans une configuration locale, un seul worker et aucun retry. Les tailles sont imposées par les cas eux-mêmes. Aucun appel fournisseur ou secret n'est nécessaire.

Pile dédiée : PostgreSQL pgvector16 sur 55447, Redis7 sur 56387, API3017 et web compilé5198, tous accessibles uniquement sur boucle locale. Les 102 migrations SQL suivies et le seed ont été appliqués à une base éphémère vide. Le premier essai SQL précédait la création de la base et n'a exécuté aucune migration ; le passage après disponibilité a réussi. Le lanceur Prisma n'est pas validé par cette préparation directe SQL.

Un premier build a été interrompu après environ quinze secondes pour intégrer une réserve de revue TLS. Aucun résultat de cet artefact n'est transféré au build final. Après validation des sources, le build final unique a réussi, puis les six cas ont été exécutés. La pile a été arrêtée et les deux conteneurs `--rm` supprimés après recette.

## Limites

Pas de publication réelle, modification DNS, compte fournisseur externe, recette Safari/WebKit ou validation production. Les six cas couvrent la consolidation de navigation et la configuration visible, pas le succès d'un déploiement fournisseur. Les preuves #784 antérieures restent inchangées et distinctes.
