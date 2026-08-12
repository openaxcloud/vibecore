# PR #125 — attribution des échecs CI

Branche `fix/from-scratch-install-dr-clean`, **SHA figé
`693ff5c8b5c5e115aec827097d0fcc2992f17ee6`**, rebasée sur `origin/main` =
`d06be185` (qui contient `29354701`, vérifié comme ancêtre).

L'auditeur demande d'**isoler les rouges hérités des nouveaux, avec preuve par SHA**.
Chaque ligne ci-dessous est établie en rejouant la vérification *exacte* du CI sur
`origin/main` **pur**, ou en comparant l'état du même job sur d'autres PR ouvertes.
Aucune n'est un « ça échouait déjà, sans doute ».

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

## Tableau définitif au SHA figé (tous les workflows relancés, plus aucun « annulé »)

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
