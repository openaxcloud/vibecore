# Rapport de couverture i18n initial — 4 août 2026

Statut : **migration ouverte — zéro anglais non prouvé**.

Ce rapport est une mesure de départ reproductible. Il ne constitue ni une validation visuelle, ni une preuve de couverture complète, ni une autorisation de fusion.

## Résultats mesurés

Commandes exécutées depuis `/Users/hb/dev/vibecore-i18n` :

```bash
node scripts/i18n/validate-catalogs.mjs --json
node scripts/i18n/scan-source.mjs --check
node scripts/i18n/scan-source.mjs --require-zero --json
pnpm exec vitest --run scripts/i18n/catalog-validator.spec.mjs scripts/i18n/source-scanner.spec.mjs 'app/routes/sitemap[.]xml.spec.ts'
```

| Mesure                                            | Résultat initial |
| ------------------------------------------------- | ---------------: |
| Entrées du catalogue anglais                      |              243 |
| Entrées du catalogue français                     |              243 |
| Clés communes en/fr                               |      243 (100 %) |
| Familles de pluriels `_one` / `_other`            |                3 |
| Fichiers source analysés                          |            1 349 |
| Fichiers avec au moins un candidat hors allowlist |              558 |
| Candidats de chaînes en dur hors allowlist        |           10 158 |
| Occurrences acceptées par l’allowlist structurée  |               18 |
| Budget de dette enregistré dans la baseline       |           10 158 |
| Modules route `.tsx` hors specs                   |              207 |
| Modules route avec leur propre export `meta`      |     161 (77,8 %) |
| Modules route sans export `meta` propre           |               46 |
| URLs canoniques dans le sitemap                   |               73 |

La parité de clés à 100 % signifie uniquement que les deux catalogues ont la même structure. Elle ne signifie pas que toutes les chaînes de la plateforme ont été externalisées. Le pourcentage global traduit et la couverture rendue restent **non mesurés / non prouvés** tant que le scan zéro et la matrice Playwright live ne passent pas.

## Périmètre du scan source

Le parseur TypeScript/JSX analyse `app`, `apps`, `packages` et `services`. Il contrôle :

- texte JSX et expressions littérales rendues ;
- `aria-label`, `title`, `placeholder`, `alt`, libellés, aides et tooltips ;
- appels de toast/notification/validation ;
- titres, descriptions, corps et sujets stockés dans des objets ;
- textes SEO statiques ;
- messages littéraux de `Error` et `Response`.

Les specs, fixtures de test, fichiers générés, catalogues de traduction déclarés, URLs pures et contenu des balises `code`, `pre`, `kbd`, `samp` sont exclus. Le scan détecte des **candidats de chaînes en dur**, quelle que soit leur langue ; il ne doit pas être présenté comme un détecteur linguistique parfait.

Extension artefacts statiques (5 août 2026) : la garde analyse désormais aussi le texte, les attributs accessibles et les métadonnées des sources HTML actives (`apps/admin/index.html`, `apps/mobile/index.html`, `public/offline.html` et la redirection historique `public/ecode-static/offline.html`). Elle inspecte également les documents HTML embarqués dans des littéraux TypeScript. Les sorties de build `public/ecode-static/index.html`, les previews de la Gallery et les répertoires runtime `.vibecore-*` ne sont pas des sources de chrome produit et ne sont pas rescannés.

Une seule exclusion étroite s’applique aux HTML embarqués : `app/lib/runtime/preview-manifest.ts` écrit un shell de réparation directement dans le projet utilisateur. La langue de ce fichier dépend du prompt et du projet, pas de la locale de l’interface E-Code ; le traduire automatiquement modifierait du contenu utilisateur. L’exclusion ne couvre que le littéral HTML de ce fichier : ses erreurs et autres messages visibles restent contrôlés par la garde.

Artefacts statiques audités dans cette tranche :

- shells `apps/admin/index.html` et `apps/mobile/index.html` ;
- page hors-ligne active `public/offline.html`, son catalogue `public/offline-messages.js`, son runtime de détection/bascule `public/offline-i18n.js` et la redirection historique `public/ecode-static/offline.html` ;
- manifests anglais canoniques et variantes françaises : `public/manifest(.fr).webmanifest`, `public/manifest(.fr).json` et `public/ecode-static/manifest(.fr).json` ;
- sous-titres silencieux appariés `public/captions/landing-demo.en.vtt` et `public/captions/landing-demo.fr.vtt` ;
- shell hors-ligne mis en cache par `/sw.js`, y compris les manifests web EN/FR et les ressources i18n hors-ligne.

Résultat de ce sous-périmètre au 5 août : **0 résidu HTML/HTML embarqué hors allowlist de marque**, 0 erreur de parsing. Cela ne change pas le statut global « migration ouverte — zéro anglais non prouvé » : les résidus UI nouvellement révélés par les règles tuples/`rows`/`empty` restent ouverts jusqu’à leur externalisation et leur vérification live.

Répartition initiale :

| Règle                        | Candidats ouverts |
| ---------------------------- | ----------------: |
| Texte JSX                    |             4 705 |
| Propriétés visibles d’objets |             3 262 |
| Attributs visibles/ARIA      |             1 444 |
| Messages `Error`             |               379 |
| Toasts et messages UI        |               279 |
| Métadonnées SEO              |                55 |
| Messages `Response`          |                33 |
| Expression JSX littérale     |                 1 |

Principaux fichiers ouverts lors de la mesure :

| Fichier                                                        | Candidats |
| -------------------------------------------------------------- | --------: |
| `app/components/chat/BaseChat.tsx`                             |     1 166 |
| `app/routes/admin.$section.tsx`                                |       447 |
| `app/components/marketing/EcodeProductMarketingPages.tsx`      |       277 |
| `app/components/marketing/EcodeSurfacePages.tsx`               |       270 |
| `app/components/marketing/EcodeMarketingPages.tsx`             |       254 |
| `apps/admin/src/panels.tsx`                                    |       207 |
| `services/api/src/app.ts`                                      |       160 |
| `app/components/@settings/tabs/providers/local/SetupGuide.tsx` |       154 |
| `app/components/marketing/ecode-exact/pages/AIAgent.tsx`       |       116 |
| `app/components/git/GitTab.tsx`                                |       104 |
| `app/components/workbench/Preview.tsx`                         |       102 |

`BaseChat.tsx` contient notamment la zone Terminal mobile déclarée gelée. Ce chiffre n’autorise aucune modification de cette zone : l’externalisation doit être coordonnée et toute exception finale documentée.

## Fonctionnement de la baseline

La baseline est un plafond de dette transitoire, pas une preuve « zéro » :

- un nouveau fichier avec une chaîne candidate échoue ;
- une hausse du nombre de candidats dans un fichier échoue ;
- à nombre égal, toute modification du jeu de candidats échoue grâce à son empreinte SHA-256 ;
- une baisse mesurée est acceptée pour permettre la migration progressive.

Une baisse peut théoriquement combiner suppression et remplacement. Le seul critère final est donc :

```bash
pnpm run i18n:scan:source:zero
```

Cette commande échoue actuellement avec 10 158 résidus, résultat attendu et publié explicitement. Toute mise à jour de baseline doit être générée avec `pnpm run i18n:scan:baseline:print`, relue dans le diff et accompagnée d’une justification ; la CI ne la met jamais à jour automatiquement.

## Allowlist actuelle

Deux règles, avec propriétaire et échéance au 4 août 2027 :

1. marques exactes `E-Code` et `VibeCore` ;
2. termes techniques autonomes approuvés : API, commit, Git, OAuth, Open Graph, SSO, Terminal et Twitter.

L’allowlist ne couvre ni phrases anglaises, ni chemins entiers, ni répertoires. Une entrée expirée rend la garde CI rouge.

## SEO livré dans cette tranche

- `/sitemap.xml` expose 73 URLs anglaises canoniques ;
- chaque URL contient des alternates `en`, `fr` et `x-default` ;
- les trois articles de blog publiés sont inclus depuis la source de données réelle ;
- dashboard, projets, administration et autres routes privées sont exclus ;
- les deux `robots.txt` autorisent exactement `?lang=en` et `?lang=fr` avant le blocage général des query strings.

La localisation des titres/meta/OG/Twitter de toutes les routes reste ouverte dans les tranches UI/SEO correspondantes. Le sitemap seul ne résout pas cette dette.

## Preuves encore manquantes

- Scan DOM rendu en français avec classification linguistique et exclusions code/marque/contenu utilisateur.
- Bascule FR ↔ EN, priorité du cookie et détection uniquement au premier passage sur domaines réels.
- Toutes les pages marketing, auth et user area, plus tous les panneaux IDE et leurs états loading/empty/error/success.
- E-mails transactionnels, notifications, factures et erreurs API dans un environnement de test réel.
- Captures avant/après en clair et sombre aux largeurs 390, 768, 1024 et 1440 px.
- Contrôle des débordements, troncatures, erreurs console, pages blanches et `<html lang>`.

Tant que ces éléments ne sont pas produits, l’état « ✅ Testé live » doit rester décoché.
