# SOL-02 → SOL-09 — matrice responsive LIVE sur la prod (2026-08-10)

Preuve live des 8 pages de vente Solutions, avec `app-builder` (SOL-01) en contrôle.

## Ce qui manquait

`DESIGN_PROGRAM_MASTER.md` et `DESIGN_AUDIT_LIVE.md` portaient SOL-02…SOL-09 en
💻 Codé (`b1b39ceb`, PR #66) mais ✅ Testé live à ☐. La matrice 16/16 avait été
jouée **en local**, et sur la **prod** uniquement sur un **échantillon**
(game / enterprise / dashboard). Il manquait la matrice complète sur la prod
déployée.

## Protocole

`scripts/capture-solution-matrix.mjs` contre `https://e-code.ai`, sans session
(pages publiques) :

- **9 slugs** — app-builder, website-builder, game-builder, dashboard-builder,
  chatbot-builder, internal-ai-builder, enterprise, startups, freelancers
- **4 largeurs** — 390 (mobile), 768 (tablette), 1024, 1440 (web)
- **2 thèmes** — clair, sombre (`colorScheme` + cookie `ecode_theme` + forçage
  `data-theme`, pour être déterministe)
- **2 langues** — EN, FR (`?lang=`)

= **144 cellules**. Capture pleine page après défilement complet (déclenche le
lazy-loading), et par cellule on mesure :

| mesure | comment |
|---|---|
| statut HTTP | réponse de navigation |
| débordement horizontal | `documentElement.scrollWidth - clientWidth` |
| erreurs console | `console[type=error]` + `pageerror` |
| langue SSR | `<html lang>` lu **avant** tout forçage client |
| cibles tactiles | rect de chaque `a/button/input/select/[role=button]` visible, seuil 44 px |

Les liens en pleine prose (`<a>` dont le parent est `P/LI/SPAN/…`) sont exclus
du contrôle 44 px : ils héritent de l'interligne du paragraphe, les compter
produirait de faux échecs.

## Résultat AVANT — un seul défaut, mais sur toute la matrice

`matrix-before.json`, prod servant alors `web:1292236e26` :

- **144/144** HTTP 200
- **144/144** débordement horizontal = **0 px**
- **144/144** **0** erreur console
- **144/144** `<html lang>` conforme à la langue demandée
- **0/144** sur les cibles tactiles — **144/144 en échec**, toujours les **mêmes
  deux éléments** : les boutons **EN** et **FR** du sélecteur de langue, mesurés
  **40 × 36 px**.

Autrement dit : la mise en page s'adapte aux 4 largeurs × 2 thèmes × 2 langues
sans un pixel de débordement ; le seul défaut était une cible tactile.

## Le défaut et sa correction

Le groupe du sélecteur portait bien `min-h-[44px]`, mais son propre `p-1`
rabotait les **boutons** — les vraies cibles — à 40 × 36. Seul l'élément
interactif compte pour la règle ≥ 44 px (WCAG 2.5.8).

Correction (`app/components/i18n/LanguageSwitch.tsx`, commit `eb87f245`) :
padding du groupe retiré, boutons passés à `min-h-[44px] min-w-[44px]`.
**Hauteur rendue inchangée** — le conteneur mesurait déjà 46 px
(44 − 2 bordures − 8 padding = 36 de contenu) et mesure toujours **90 × 46** :
aucun consommateur ne bouge (header, auth, dashboard, IDE, shell marketing).

Le sélecteur propre aux pages Solutions (`.sol-language-switch a`) était **déjà
conforme** (`min-height: 44px; min-width: 72px`) : le défaut ne venait que du
composant partagé du header.

Non-régression : `LanguageSwitch.spec.tsx` verrouille les classes réelles, avec
**contrôle négatif vérifié** — réintroduire `min-h-[36px]`/`min-w-[40px]` fait
échouer le test, et lui seul.

## Résultat APRÈS — 144/144 propre

Matrice rejouée à l'identique sur la prod servant `web:f4b657b062`
(run CD `31363456583` vert : helm upgrade + `Verify rollout` + garde D2).
`matrix-after.json` :

| mesure | avant | après |
|---|---|---|
| HTTP 200 | 144/144 | **144/144** |
| débordement horizontal = 0 | 144/144 | **144/144** |
| 0 erreur console | 144/144 | **144/144** |
| `<html lang>` conforme | 144/144 | **144/144** |
| cibles tactiles ≥ 44 px | **0/144** | **144/144** |

Contrôle direct sur la page live après déploiement :

```
boutons [data-testid="language-switch"] button : EN 44×44, FR 44×44
groupe  [data-testid="language-switch"]        : 90×46   (identique à avant)
```

Les 44 px sont atteints **sans déplacer quoi que ce soit** : le groupe mesurait
déjà 90 × 46 avant le correctif.

### Captures

`shots/` — 48 captures curées, 6 combinaisons par page pour les 8 pages
SOL-02…SOL-09 : `en-light-390`, `en-dark-390`, `en-light-1440`, `en-dark-1440`,
`fr-light-768`, `fr-dark-1024` (mobile + web dans les deux thèmes, tablette et
1024 en français). Redimensionnées à 900 px de large pour tenir la convention du
répertoire (~180 Ko/capture) ; les 144 captures pleine résolution de chaque
passage ne sont pas versionnées, les mesures qui les accompagnent le sont
(`matrix-before.json`, `matrix-after.json`).

## Effet de bord trouvé en route : le CD était mort depuis le 08/08

Le premier push a été refusé par la garde `Secret scan (blocking)` : les
snapshots quotidiens du collecteur parité réintroduisent le faux positif Sanity
`_key` sous un chemin daté neuf chaque jour. Les commits de snapshot des 08, 09
et 10/08 ne déclenchent pas le CD, donc la dette est restée invisible jusqu'au
push suivant : **`main` n'était plus déployable depuis le 08/08** et la prod
tournait encore sur le build du 07/08.

Vérifié avant d'exempter : `84971a3c25ef` est le `_key` du span dont le texte
est « If you have any questions about these Terms, please contact », l'un des
**357** `_key` de 12 hex du même document Portable Text — identifiant de bloc,
pas une clé d'accès. Trois lignes auditées ajoutées à `.gitleaksignore`
(commit `f4b657b0`), conformément à la politique déjà inscrite dans ce fichier.

**Rendre l'exemption durable relève d'Avi** : une allowlist de chemin sur
`docs/parity/baseline/snapshots/**` reviendrait à cesser de scanner ce
répertoire.

## Localisation de l'index `/solutions` (I18N-FR-001)

Mesuré sur la prod du 07/08 : sous `Accept-Language: fr-FR`, `/solutions`
servait bien `<html lang="fr">` et `og:locale=fr_FR`, mais **sa description et
son `og:title` restaient en anglais** — les 9 fiches sont localisées, l'index
qui les liste ne l'était pas.

```
-- Accept-Language: fr-FR
   description: Explore E-Code solutions for app builders, websites, games, …
   og:title   : E-Code Solutions
-- Accept-Language: en-US
   description: Explore E-Code solutions for app builders, websites, games, …
   og:title   : E-Code Solutions
```

Corrigé par `113c17e8` (catalogue `marketing-solutions-route.ts` EN/FR + locale
résolue côté serveur). Le scanner i18n passe de **29 résidus / 8 fichiers** à
**23 / 7**, et `solutions._index.tsx` sort des régressions de référence.
