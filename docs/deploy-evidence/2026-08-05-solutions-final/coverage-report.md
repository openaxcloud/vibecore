# Rapport de couverture — 8 pages Solutions EN/FR

Instantané honnête : 6 août 2026 à 11:31 (UTC+03:00).

Ce rapport couvre uniquement `app-builder`, `website-builder`, `game-builder`, `dashboard-builder`, `chatbot-builder`, `internal-ai-builder`, `startups` et `freelancers`. La page Enterprise, sa copy et ses visuels restent hors périmètre et ne sont pas modifiés.

> **État de clôture : NON FAIT.** Il n'existe aucun déploiement final de cette branche, aucune capture marketing finale dans ce dossier, aucune ligne de matrice responsive et aucun `capture-result.json` vert. Les compteurs restent donc à **0/96 captures** et **0/128 lignes**. Aucun overflow, changement de langue ou visuel de thème n'est validé en réel.

## Inventaire des huit pages

| Page                | Route publique                   | Module de route exact                          | Source EN/FR                                                     |
| ------------------- | -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| App Builder         | `/solutions/app-builder`         | `app/routes/solutions.app-builder.tsx`         | `app/components/marketing/solutions/app-builder.copy.ts`         |
| Website Builder     | `/solutions/website-builder`     | `app/routes/solutions.website-builder.tsx`     | `app/components/marketing/solutions/website-builder.copy.ts`     |
| Game Builder        | `/solutions/game-builder`        | `app/routes/solutions.game-builder.tsx`        | `app/components/marketing/solutions/game-builder.copy.ts`        |
| Dashboard Builder   | `/solutions/dashboard-builder`   | `app/routes/solutions.dashboard-builder.tsx`   | `app/components/marketing/solutions/dashboard-builder.copy.ts`   |
| Chatbot Builder     | `/solutions/chatbot-builder`     | `app/routes/solutions.chatbot-builder.tsx`     | `app/components/marketing/solutions/chatbot-builder.copy.ts`     |
| Internal AI Builder | `/solutions/internal-ai-builder` | `app/routes/solutions.internal-ai-builder.tsx` | `app/components/marketing/solutions/internal-ai-builder.copy.ts` |
| Startups            | `/solutions/startups`            | `app/routes/solutions.startups.tsx`            | `app/components/marketing/solutions/startups.copy.ts`            |
| Freelancers         | `/solutions/freelancers`         | `app/routes/solutions.freelancers.tsx`         | `app/components/marketing/solutions/freelancers.copy.ts`         |

App Builder possède son rendu dédié. Les sept autres routes utilisent le contrat partagé `makeSolutionRoute()` et `SolutionSalesPage`. L'index `/solutions` continue à lire le registre historique `solutionPages` dans `app/components/marketing/EcodeMarketingPages.tsx`. Le fallback `app/routes/solutions.$slug.tsx` conserve la redirection permanente `/solutions/internal-ai` → `/solutions/internal-ai-builder` en 308, chaîne de requête comprise.

Branche de cet instantané : `codex/solutions-real-proof-20260802`. HEAD de base avant les changements non commités : `aaafe93b7d09408479d8c1e7499632e5bcc59701`. Ce n'est pas un SHA final de livraison ; aucune PR draft n'est encore publiée pour cet état.

## Couverture EN/FR mesurée

Le scanner `scripts/audit-solutions-fr-residuals.mjs` aplatit les feuilles `string` de chaque objet `copy.en` et `copy.fr`, vérifie l'identité des chemins, classe les valeurs identiques uniquement selon des règles documentées, puis recherche les résidus anglais après neutralisation des marques et termes techniques autorisés. L'artefact exhaustif est `translation-coverage.json` dans ce même dossier.

| Page                | Feuilles EN | Feuilles FR | Clés manquantes | FR distinctes | Identiques autorisées | Taux distinct |
| ------------------- | ----------: | ----------: | --------------: | ------------: | --------------------: | ------------: |
| App Builder         |         167 |         167 |               0 |           161 |                     6 |       96,41 % |
| Website Builder     |         158 |         158 |               0 |           151 |                     7 |       95,57 % |
| Game Builder        |         158 |         158 |               0 |           152 |                     6 |       96,20 % |
| Dashboard Builder   |         158 |         158 |               0 |           151 |                     7 |       95,57 % |
| Chatbot Builder     |         158 |         158 |               0 |           153 |                     5 |       96,84 % |
| Internal AI Builder |         158 |         158 |               0 |           154 |                     4 |       97,47 % |
| Startups            |         158 |         158 |               0 |           155 |                     3 |       98,10 % |
| Freelancers         |         158 |         158 |               0 |           155 |                     3 |       98,10 % |
| **Total**           |   **1 273** |   **1 273** |           **0** |     **1 232** |                **41** |   **96,78 %** |

La structure EN/FR est alignée à **100 %** : 1 273 feuilles de chaque côté et aucune clé manquante. Les 1 232 valeurs françaises distinctes et les 41 valeurs identiques autorisées donnent un taux de localisation validée de **100 %** selon le contrat du scanner. Le scan final contient **0 résidu non autorisé**.

### Chaînes volontairement identiques ou laissées en anglais

Les 41 identiques sont exhaustivement listées, chemin par chemin, dans `translation-coverage.json` :

- autonymes du sélecteur : `English`, `Français` ;
- valeurs neutres : heures `09:00`, `11:30`, `14:00` ;
- noms fictifs ou propres : `Meridian Studio`, `TriviaClash`, `PipelineIQ`, `HelpDesk Copilot`, `PeopleOps`, `Launchpad`, `Studio Ferro`, `Nadia`, `Marco`, `Priya`, `Northwind Traders`, `Atlas Logistics`, `Beacon Retail Group`, `Nouvelle-Aquitaine` ;
- homographes ou termes valides dans l'interface française : `Clients`, `Studio`, `Contact`, `Public · 2024`, `Pipeline`, `Sources`, `Documentation`, `Permissions`.

Dans les phrases françaises, les noms d'offres et surfaces (`App Builder`, `Agent`, `Webview`, `IDE`), la marque `E-Code`, les technologies/acronymes (`React`, `TypeScript`, `JavaScript`, `API`, `URL`, `CMS`, `KPI`, `RAG`, `MVP`) et des termes techniques comme `build`, `runtime`, `frontend`, `backend`, `workspace`, `prompt`, `responsive` et `no-code` restent autorisés lorsqu'ils désignent précisément le produit ou la technique. Ils ne sont pas comptés comme une traduction manquante.

### Avant / après du scanner

| Référence                                       | Avant | Après | Provenance                                                                                             |
| ----------------------------------------------- | ----: | ----: | ------------------------------------------------------------------------------------------------------ |
| Baseline éditoriale avant corrections           |    54 |     0 | Premier artefact scanner de la passe éditoriale ; pas de ventilation par page conservée.               |
| Comparaison reproductible au HEAD `aaafe93b...` |   116 |     0 | Scanner final et mêmes allowlists appliqués aux huit fichiers tels qu'ils existaient à ce HEAD précis. |

Ces deux baselines sont distinctes et ne doivent pas être additionnées. Le JSON conserve leur provenance et, pour `aaafe93b`, la ventilation par règle et par page.

## Visuels : inventaire physique actuel

Le contrat demande 6 slots logiques par page × 2 langues × 2 thèmes × 2 largeurs, soit **48 WebP par page** et **384 WebP** pour les huit pages. La présence physique n'est pas une validation : une série issue d'un run rejeté reste candidate et ne peut être présentée comme preuve finale.

| Page                | WebP EN | WebP FR | Physiques / attendus | Manquants physiques | État actuel                                                                              |
| ------------------- | ------: | ------: | -------------------: | ------------------: | ---------------------------------------------------------------------------------------- |
| App Builder         |      16 |      16 |              32 / 48 |                  16 | Quatre slots produit par langue présents ; les deux slots IDE par langue manquent.       |
| Website Builder     |      24 |       0 |              24 / 48 |                  24 | Série EN candidate seulement ; aucun résultat final vert.                                |
| Game Builder        |      24 |      24 |              48 / 48 |                   0 | Physiquement complet, mais les runs de contrôle EN et FR ont échoué ; série non validée. |
| Dashboard Builder   |       0 |      24 |              24 / 48 |                  24 | Série FR candidate seulement ; le run final FR échoue et aucune série EN n'est promue.   |
| Chatbot Builder     |       0 |       0 |               0 / 48 |                  48 | Non produit.                                                                             |
| Internal AI Builder |       0 |       0 |               0 / 48 |                  48 | Non produit.                                                                             |
| Startups            |       0 |       0 |               0 / 48 |                  48 | Non produit.                                                                             |
| Freelancers         |       0 |       0 |               0 / 48 |                  48 | Non produit.                                                                             |
| **Total**           |  **88** |  **40** |        **128 / 384** |             **256** | **0 page validée sur 8 ; 0 `capture-result.json` vert.**                                 |

Douze PNG App Builder historiques sont encore présents dans `public/assets/solutions/app-builder/` ; ils ne font pas partie du contrat WebP final. La branche legacy Enterprise référence exactement quatre de ces PNG — `ide-agent-preview.png` et `ide-agent-iteration.png`, en EN et FR — comme preuves App Builder historiques. Ces **4 PNG Enterprise legacy restent hors périmètre et hors contrat 384 WebP**. Les deux OG Enterprise sont eux aussi hors scope ; les 16 OG EN/FR des huit pages restent séparés du contrat de captures.

## Blocages réels reproduits par le harness IDE

Le dossier `outputs/solutions/` ne contient aucun `capture-result.json`. Les fichiers `capture-failure.txt` et les diagnostics runtime enregistrent les échecs suivants ; aucun n'est converti en passage vert.

### Wave A fraîche et reprises

Au premier lancement frais de la Wave A à 10:03, les quatre locales **Website EN, Website FR, Game FR et Dashboard EN** sont restées sur `Loading E-Code` sans `textarea` de prompt. Elles ont ensuite été retentées, au maximum deux fois par locale, ce qui a permis d'obtenir les diagnostics plus précis ci-dessous. Cet échec initial n'est attribué ni à App Builder ni à Chatbot Builder.

- **Website EN et Website FR** : `Preview stayed empty. Visible status: No visible preview status. Underlying failure: The native Webview stayed empty after refresh and official runtime URL recovery`.
- **Game FR, tentative Webview** : même erreur de Webview native vide.
- **Dashboard EN** : même erreur de Webview native vide.

Pour ces quatre reproductions (Website EN/FR, Game FR et Dashboard EN), le runtime officiel indiquait `running`, le dernier lifecycle `RUNNING`, le port `5173` était `ready: true` avec processus présent, et la lecture HTTP directe répondait 200. C'est donc la Webview native visible qui restait vide ; le rapport ne transforme pas la santé du runtime en preuve d'écran.

### Autres fins de run exactes

- **Game EN** : `The E-Code proof emitted 1 console errors: https://app.e-code.ai/api/projects/cmsh63sae043q0oelnyzt2j6a/ide-state:0:0 Failed to load resource: the server responded with a status of 412 ()`.
- **Game FR, gate Problems** : `Error runtime Dependency sync skipped before preview: Remote runtime request failed: 404`, avec `Open Problems. 1 error, 0 warnings.`. Le harness a refusé la capture.
- **Dashboard FR** : `Preview stayed empty. Visible status: No visible preview status. Underlying failure: The native Webview stayed empty after refresh and official runtime URL recovery`. Son diagnostic persiste aussi `RUNNING` et `5173 ready`, sans résultat vert.

Ces messages viennent de l'aperçu/harness réel et sont rapportés tels quels. Les WebP déjà présents pour Website EN, Game EN/FR et Dashboard FR restent donc des candidats historiques ou provisoires, pas des captures finales acceptées.

## Preuve responsive et déploiement

| Gate                                         | Attendu | Mesuré | Statut                     |
| -------------------------------------------- | ------: | -----: | -------------------------- |
| Déploiement final de la branche              |       1 |      0 | **NON LANCÉ**              |
| Captures marketing finales                   |      96 |      0 | **NON LANCÉ / NON VALIDÉ** |
| Matrice responsive                           |     128 |      0 | **NON LANCÉ / NON VALIDÉ** |
| Lignes avec overflow horizontal égal à zéro  |     128 |    n/a | **NON MESURÉ**             |
| Lignes sans troncature                       |     128 |    n/a | **NON MESURÉ**             |
| Bascule EN→FR→EN                             |     128 |      0 | **NON MESURÉ**             |
| Thème et variante visuelle distincte         |     128 |      0 | **NON MESURÉ**             |
| Pages avec six visuels EN/FR clair/sombre OK |       8 |      0 | **NON VALIDÉ**             |

Les 96 captures attendues sont 8 pages × 2 langues × 2 thèmes × 3 formats (`390`, `768`, `1440`). La matrice ajoute `1024`, soit 128 combinaisons. Aucun fichier PNG final, rapport de matrice ou rapport d'exécution live n'existe encore dans `docs/deploy-evidence/2026-08-05-solutions-final/`.

## Tests et harness présents

Les fichiers suivants sont présents dans la branche :

- scanners/harness : `scripts/audit-solutions-fr-residuals.mjs`, `scripts/capture-app-builder-ide-proof.ts`, `scripts/capture-solutions-final-proof.mjs` ;
- unitaires : `tests/unit/solutions-fr-residuals.test.mjs`, `tests/unit/solutions-proof-harness.test.mjs` ;
- copy/visuels/routes : `app/components/marketing/solutions/app-builder.copy.spec.ts`, `app/components/marketing/solutions/solution-declines.spec.ts`, `app/components/marketing/solutions/solution-proof.visuals.spec.ts`, `app/routes/solutions.app-builder.spec.ts`, `app/routes/solutions.declines.spec.ts`, `app/routes/solutions.$slug.redirect.spec.ts` ;
- E2E : `tests/e2e/solution-app-builder.spec.ts`, `tests/e2e/solution-declines.spec.ts`.

Les validations locales exécutées sur cet instantané donnent :

- scanner FR : **PASS**, 1 273/1 273 feuilles, 0 clé manquante et 0 résidu non autorisé ;
- sélection Vitest Solutions : **208 tests passés, 2 ignorés**, sur 9 fichiers ;
- typecheck TypeScript : **PASS** ;
- lint application et scripts ciblés : **PASS, 0 erreur** ; les 48 avertissements restants viennent de fichiers existants hors périmètre Solutions ;
- build production : **PASS** (`VITE_RUNTIME_MODE=remote-kubernetes`, 6 août 2026) ;
- gate physique des visuels : **FAIL attendu**, 19 tests passés et 2 échecs qui listent les WebP manquants ;
- Playwright live, déploiement, captures 96 et matrice 128 : **non exécutés**, faute d'un jeu de 384 visuels validé et d'un aperçu IDE sain.

Le JSON scanner courant porte donc `scannerStatus: pass` pour la gate de résidus uniquement. Les validations locales vertes ne valent ni preuve déployée ni validation visuelle. **Ce rapport ne revendique aucun passage final de Playwright, déploiement, assets 384, captures 96 ou matrice 128.**

## Condition de clôture

La tâche restera **NON FAITE** jusqu'à ce que les 384 WebP soient présents et validés, que chaque génération IDE se termine sans Problems/erreur console/Webview vide, qu'une branche soit réellement déployée, puis que le harness live produise exactement 96/96 captures et 128/128 lignes avec overflow = 0, aucune troncature, bascule EN↔FR correcte et variantes clair/sombre réellement distinctes. Enterprise et ses quatre PNG legacy ne participent à aucun de ces compteurs.
