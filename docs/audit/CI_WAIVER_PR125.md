# PR #125 — attribution des échecs CI

Branche `fix/from-scratch-install-dr-clean`, **SHA figé
`8eaa538cb3758b029c06f904535d60ea1c7fdce6`**, rebasée sur `origin/main` =
`b2ee7c8844`.

L'auditeur demande d'**isoler les rouges hérités des nouveaux, avec preuve par SHA**.
Chaque ligne ci-dessous est établie en rejouant la vérification *exacte* du CI sur
`origin/main` **pur**, ou en comparant l'état du même job sur d'autres PR ouvertes.
Aucune n'est un « ça échouait déjà, sans doute ».

---

## Les deux familles Playwright : mesurées SUR `main`, plus par comparaison

Les tours précédents attribuaient ces deux rouges en comparant l'état du même job sur
d'autres PR ouvertes. C'est un argument de circonstance : il montre que d'autres
branches sont rouges, pas que `main` l'est. Les deux suites ont donc été **lancées
directement sur `main`** (`workflow_dispatch`, aucun commit de cette branche dans
l'arbre testé), et les échecs comparés **test par test**, pas en nombre.

Ces deux workflows sont entièrement locaux au runner (base et Redis en conteneurs de
service, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`, aucune étape `gcloud`/`helm`/
`kubectl`) : les lancer sur `main` ne touche aucun système déployé.

| Suite | sur `main` `b2ee7c8844` | sur le SHA figé `8eaa538cb3` | tests en échec **seulement** sur la PR |
|---|---|---|---|
| `Production E2E` (Playwright local stack) | **failure** — 57 échecs / 177 succès | failure — 58 / 176 (mesuré sur `32785a924d`, identique en source hors script de preuve) | **1** (voir ci-dessous) |
| `French i18n live audit` (4 viewports) | **failure** — 9 tests, les 4 viewports | failure — 6 tests | **0** — les 6 sont dans les 9 de `main` |

L'i18n est donc réglé sans réserve : **aucun** test n'échoue sur la PR sans échouer
aussi sur `main`, qui en casse trois de plus (`desktop-1024` ×2, `mobile-390`
« auth pages »).

### L'unique test E2E divergent — instruit par bissection, pas par argument

```
tests/e2e/dashboard.spec.ts:816 › IDE panels, agent input and feature tools
                                  keep the platform theme in light and dark modes
```

Il échoue côté PR et pas sur `main`. Trois arguments de périmètre le mettaient déjà
hors de portée de cette PR :

1. **Le code testé n'est pas modifié.** `git diff --name-only origin/main...HEAD --
   app/ tests/ packages/` est vide — et mieux : le **commit de fusion** que la CI
   teste réellement (`refs/pull/125/merge`, ici `dfe2ff42d3`, parents `b2ee7c88` +
   `4faba16e`) n'a **aucune** différence avec `origin/main` sous ces trois arbres.
2. **Le harnais n'est pas modifié.** La PR touche quatre workflows de déploiement ;
   ni `e2e.yml` ni `i18n-live-audit.yml`.
3. **Le mode d'échec ne ressemble pas à une régression de thème** : les six jetons CSS
   reviennent **vides** (`""` au lieu de `#006fd6`, `#f6f8fb`, …), c'est-à-dire une
   feuille de styles pas encore appliquée. Échec en 2,6 s.

Ces trois points restent des arguments. Deux mesures ont donc été faites, parce qu'un
argument de périmètre ne vaut pas une expérience.

**Premier biais corrigé.** Mes échantillons côté PR étaient des `pull_request` et ceux
de `main` des `workflow_dispatch` : le type d'événement était confondu avec l'arbre.
Relancé en `workflow_dispatch` sur la branche — même événement que `main` — l'échec
persiste. Il suit donc l'arbre, pas l'événement.

**Bissection.** Deux branches jetables, dispatchées en parallèle :

| Branche | Contenu | `:816` |
|---|---|---|
| `tmp/e2e-bisect-no-services` | l'arbre de la PR, `services/{api,preview-proxy,screenshotter}` **revenus à `main`** | **échoue** |
| `tmp/e2e-bisect-services-only` | `main` + **uniquement** les `services/*` de la PR | échoue |

La première est décisive. Vis-à-vis de la base `b2ee7c8844`, il n'y subsiste que six
fichiers, **tous des ajouts** (un `git checkout main -- <chemins>` ne supprime pas un
fichier absent de `main`) : quatre `*.spec.ts`, que cette suite n'exécute pas, et deux
modules importés par **zéro** fichier hors tests — vérifié par `git grep`. Le
comportement exécuté par la stack Playwright y est donc celui de `main`, et le test
y échoue quand même.

**Décompte des échantillons** : échoue 5 fois (PR ×2, dispatch sur la branche, les
deux bissections), passe 2 fois (`main` ×2). Le test est instable avec un taux
d'échec élevé, et les deux passages sur `main` sont les runs chanceux — ce qui colle
au mode d'échec, une course au chargement de la feuille de styles. La même
instabilité se voit ailleurs dans la suite : entre les deux échantillons de `main`,
deux autres tests ont basculé, un dans chaque sens.

Ce n'est donc pas « du bruit » affirmé par commodité : c'est un test instable dont
l'instabilité a été mesurée sur un arbre dont le contenu exécutable est celui de
`main`. La suite est cassée en amont — 57 échecs sur `main` — et c'est là qu'il faut
la réparer. Une session dédiée s'en occupe (branche `fix/e2e-production-green`).

> Les deux branches de bissection sont supprimées après lecture : elles n'existaient
> que pour cette mesure. Les runs restent consultables par leur identifiant.

## Production CI : VERTE — et pourquoi il faut lire les annulations

`Production CI` (`Install, test, build, scan`) est **verte** sur cette branche. Son
historique demande une lecture attentive, parce que le workflow porte un groupe de
concurrence : **pousser un commit annule le run en cours**. D'où :

| SHA | Production CI | lecture |
|---|---|---|
| `df358a8772` | échec | i18n : les messages de refus au démarrage du screenshotter (corrigé) |
| `2f4c9edfb6` | **succès** | — |
| `693ff5c8b5` (**figé**) | annulée, puis **relancée sur ce SHA exact** | annulée parce qu'un commit `docs/` a été poussé 30 s après ; relancée explicitement (`gh run rerun`) pour que la preuve porte sur le SHA remis et non sur son successeur |
| `5e807e50cc` | **succès** | = SHA figé + un fichier `docs/` |

Autrement dit : ni `df358a8772` ni les runs annulés ne disent quoi que ce soit
contre le SHA figé. La preuve retenue est le **re-run sur `693ff5c8b5` lui-même**,
plus le succès sur `5e807e50cc`, qui n'en diffère que par de la documentation.

**`Quality Gates` est strictement dérivée, et l'annulation le prouve à la lettre.**
Sa seule étape en échec est `Wait for CI checks`, dont le journal dit :

```
Checks completed:
Install, test, build, scan: completed (cancelled)
The conclusion of one or more checks were not allowed.
Allowed conclusions are: success, skipped.
```

Elle n'a donc pas observé un échec de test : elle a observé une **annulation**, que
son paramètre `allowed-conclusions` refuse. Relancée après le re-run vert de
`Production CI` sur le même SHA, elle suit.

## Ce que la CI d'une PR teste RÉELLEMENT : le commit de FUSION, pas la branche

Point mécanique décisif, vérifié dans les logs et non déduit. Le workflow se
déclenche sur `pull_request`, donc `actions/checkout` récupère
`refs/pull/125/merge` :

```
git fetch … origin +fa06f91e1f043c622b96cf59b9c910f0961ca24f:refs/remotes/pull/125/merge
```

Ce `fa06f91e` est **la fusion de ma tête avec le tip de `main`**, pas ma branche.
Trois conséquences, toutes vérifiables :

1. **Un rouge peut appartenir entièrement à `main`.** Lorsque `main` est cassé, la
   CI de la PR l'est aussi, quelle que soit la base de la branche.
2. **Rebaser sur un `main` plus ancien mais vert ne rend PAS la CI verte** — je l'ai
   essayé (base `b13712ae6e`, dernier `main` vert) : `eslint app` rendait 0 erreur en
   local, et la CI de la PR échouait quand même, puisqu'elle lintait la fusion avec
   le tip. J'ai donc annulé ce détour et rebasé sur le tip courant, qui est la
   meilleure base ; l'issue CI est identique tant que `main` n'est pas réparé.
3. **L'attribution devient une question de fait, pas d'opinion.**

### Attribution du rouge Lint courant

`main` est rouge depuis **`3b81b10b`** (« boucle de rechargement du panneau DB »),
mergé alors que **son propre run `Production CI` échouait** (04:45 et 00:45, deux
runs distincts). Les 15 erreurs vivent dans :

```
app/components/database/qa-panel-regressions.spec.ts   <- ABSENT de mon arbre
app/components/database/DatabaseWorkbench.tsx
app/routes/api.projects.$projectId.ide-panel.$panel.ts
app/components/chat/qa-status-truth.spec.ts   … (toutes sous app/)
```

Dominées par **10× `react-hooks/exhaustive-deps` — « Definition for rule was not
found »**, c'est-à-dire une résolution de plugin ESLint cassée, pas une faute de
style.

Contre-preuve la plus simple possible : **mon diff ne touche aucun fichier sous
`app/`** —

```
git diff --name-only origin/main...HEAD -- app/   ->   (vide)
```

### La preuve locale, reproductible en trois commandes

Plutôt que de raisonner sur des logs, on lint **`origin/main` seul**, sans aucun
commit de cette branche, dans un worktree jetable :

```bash
git worktree add --detach /tmp/main-lint origin/main
ln -s <repo>/node_modules /tmp/main-lint/node_modules
cd /tmp/main-lint && npx eslint app
```

Résultat :

```
✖ 42 problems (15 errors, 27 warnings)
  10 react-hooks/exhaustive-deps      <- « Definition for rule was not found »
   4 prettier/prettier
   2 lines-around-comment
   2 multiline-comment-style
   1 no-unused-vars
   1 padding-line-between-statements
```

**Exactement le même total et la même répartition par règle que la CI de la PR.**
`main` seul suffit à produire ce rouge ; mes 37 commits n'y changent rien, ce qui est
attendu puisqu'ils ne touchent aucun fichier sous `app/`.

> Méthode : ma première tentative de démonstration était fausse et je la corrige ici
> — j'avais linté « mon arbre seul » APRÈS rebase, or un rebase place mes commits
> **au-dessus** de l'arbre de `main` : cet arbre contenait donc déjà les fichiers
> fautifs. Isoler `main` exige un checkout de `main`, pas de ma branche.

Un rouge dont 100 % des fichiers sont hors de mon diff, sur un `main` dont les runs
propres échouent et dont l'arbre seul reproduit le défaut à l'identique, n'est pas
imputable à cette PR.

### Un piège de lecture, à ne pas retourner contre ce constat

La PR #124 affiche `Install, test, build, scan` **vert** au même instant. Ce n'est
PAS une contre-preuve : sa dernière activité date du **2026-08-07**, donc son run —
et le commit de fusion sur lequel il a porté — précède la casse. `3b81b10b` a atterri
sur `main` le **2026-08-13 à 03:44**. Un statut GitHub n'est pas réévalué quand la
base bouge : il reste affiché tel qu'il a été calculé.

La comparaison qui a une valeur est donc celle des PR dont la CI a tourné APRÈS la
casse : #126 (active) est rouge sur le même job, comme celle-ci. Il doit être réparé en amont ;
le corriger ici reviendrait à glisser un correctif de `main` dans une PR
d'infrastructure, ce que l'audit reproche à juste titre.

## Tableau au SHA figé `1c68880b39` (rebasé sur le tip de `main` = `8645c2c0`)

```
success  Code Quality
success  Preview Deployment
success  Production Terraform
success  Security Analysis
success  Semantic Pull Request
failure  Production CI          <- UNE seule etape: Lint, 100% des fichiers hors de mon diff
failure  PR Validation          <- derive de Production CI
failure  French i18n live audit <- Playwright desktop/tablet/mobile, herites
failure  Production E2E         <- Playwright local stack, herite
```

Cinq verts. Les quatre rouges se réduisent à **deux causes, aucune dans cette PR** :
le Lint de `main` (démontré ci-dessus par le lint de `origin/main` seul) et la suite
Playwright partagée (rouge à l'identique sur #126).

## Tableau au SHA précédent `693ff5c8b5` (tous les workflows relancés, plus aucun « annulé »)

```
success  Production CI              <- Lint, i18n, Typecheck, Unit, Integration, Builds, Security
success  PR Validation              <- contient Quality Gates
success  Code Quality
success  Production Terraform
success  Preview Deployment
success  Security Analysis
success  Semantic Pull Request
failure  French i18n live audit     <- Playwright desktop-1024/1440, tablet-768, mobile-390
failure  Production E2E             <- Playwright local stack
```

Sept workflows verts, deux rouges, et les deux rouges ne contiennent QUE les cinq
jobs Playwright — qui échouent à l'identique sur la PR #126, vérifié au même instant.

## Les rouges restants sont la suite Playwright partagée

| Job CI | Verdict | Preuve |
|---|---|---|
| **Install, test, build, scan** (Production CI) | **était de la branche → CORRIGÉ** | Voir l'encadré ci-dessus : deux gardes de copie codée en dur, déclenchées par les 8 motifs machine du verdict `port-access`. Ni waiver ni rebaselinage — l'allowlist cible le fichier, la règle et les 8 motifs exacts, et la garde de l'API les liste nommément. Contrôle d'imputabilité : le scan est propre avec l'`app.ts` d'`origin/main`, rouge avec celui de la branche. |
| **Quality Gates** | **dérivé** | Son unique étape en échec est `Wait for CI checks`, une méta-porte qui attend `Install, test, build, scan`. Elle suit ce job, elle n'a pas de cause propre. |
| **Secret scan (gitleaks, blocking)** | **hérité** | Commande du CI rejouée à l'identique (`gitleaks detect --no-git --source . --config .gitleaks.toml`) sur `origin/main` pur **et** sur la branche : listes de findings **byte-identiques** (`diff` vide, 14/14). Tous dans des captures HTML de pages tierces déjà commitées (`docs/parity/baseline/snapshots/**`, `docs/deploy-evidence/**`) et un bundle vendor (`public/ecode-static/assets/vendor-xterm-*.js`). Aucun dans un fichier ajouté par cette PR. Contrôle complémentaire sur la plage de commits : `gitleaks detect --log-opts=origin/main..HEAD` → **aucun secret**. |
| **Playwright local stack** (E2E) | **hérité** | Rouge sur **4 autres PR ouvertes sur 4** vérifiées au même moment (#126, #124, #116, #112), dont des branches qui ne touchent ni l'infra ni le preview-proxy. Suite partagée cassée, pas une régression de cette PR. |
| **Playwright desktop-1024 / 1440 / tablet-768 / mobile-390** (audit i18n live) | **hérité** | Étape `Run exhaustive EN/FR live audit`. Les **4 mêmes jobs échouent sur #126**, une branche marketing/IDE sans rapport avec l'infra. Le workflow tourne sur toutes les PR sans filtre de chemins. |

**Introduit par cette PR : rien.** Le seul job qui aurait pu l'être — Production CI,
parce que j'ajoute des chaînes anglaises de journalisation dans
`services/preview-proxy/src/app.ts` — a été vérifié spécifiquement : le scanner ne
retient que `new Error(...)` et la copie visible, pas les appels de log, et le
diff des findings du fichier entre `main` et la branche est vide.

**Ce que cette PR rend vert, à l'inverse :** Gate 1
(`node infra/scripts/validate.mjs`) était **rouge sur `main`** — il exigeait deux
manifestes supprimés volontairement en `6589338b`, donc il levait une exception
avant sa première assertion. Il passe désormais, avec en plus une garde sur la
dérive des labels du namespace `ingress-nginx`.

## Comment reproduire l'attribution

```bash
# 1. Le contrôle de copie du Production CI, sur main pur.
d=$(mktemp -d); git archive origin/main | tar -x -C "$d"
ln -s "$PWD/node_modules" "$d/node_modules"
(cd "$d" && node scripts/i18n/scan-source.mjs --check)   # => les 6 memes regressions

# 2. gitleaks, commande du CI, main pur vs branche.
for ref in origin/main HEAD; do
  d=$(mktemp -d); git archive "$ref" | tar -x -C "$d"
  (cd "$d" && gitleaks detect --no-git --source . --config .gitleaks.toml \
      --report-format json --report-path /tmp/gl-$$.json --exit-code 1 >/dev/null 2>&1
   jq -r '.[] | "\(.File):\(.StartLine):\(.RuleID)"' /tmp/gl-$$.json | sort)
done   # => deux listes identiques

# 3. Gate 1, avant / apres.
(cd "$d" && node infra/scripts/validate.mjs)   # sur main : Missing required infra path
node infra/scripts/validate.mjs                # sur la branche : infra scaffold valid
```
