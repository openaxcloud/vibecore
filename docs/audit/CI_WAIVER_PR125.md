# PR #125 — attribution des échecs CI

Branche `fix/from-scratch-install-dr-clean`, SHA **`593da4c1c2f90c42e4f7a2ce0e3f792ce1184eb9`**,
rebasée sur `main` = `c90b4bb2`.

L'auditeur demande d'**isoler les rouges hérités des nouveaux, avec preuve par SHA**.
Chaque ligne ci-dessous est établie en rejouant la vérification *exacte* du CI sur
`origin/main` **pur** (export propre du commit, aucun fichier de la branche), ou en
comparant l'état du même job sur les autres PR ouvertes. Aucune n'est un « ça
échouait déjà, sans doute ».

| Job CI | Verdict | Preuve |
|---|---|---|
| **Install, test, build, scan** (Production CI) | **hérité** | Échoue sur le contrôle de copie codée en dur (`node scripts/i18n/scan-source.mjs --check`), pas sur les tests ni le build. Rejoué sur `origin/main` pur : **exactement les mêmes 6 régressions**, `services/preview-proxy/src/app.ts: new-file-debt (baseline=0, current=2)` incluse. Le baseline commité (`scripts/i18n/source-baseline.json`) a dérivé de `main`, indépendamment de cette branche. Vérifié en plus au niveau du fichier : le scanner trouve **9 findings sur `main` et 9 sur la branche, 0 ajouté, 0 supprimé** — les empreintes sont `sha256(règle + texte)`, donc insensibles au décalage de lignes que mon édition provoque. |
| **Quality Gates** | **hérité, dérivé** | Son unique étape en échec est `Wait for CI checks` : c'est une méta-porte qui attend les autres jobs. Elle est rouge *parce que* Production CI est rouge, et redeviendra verte avec lui. |
| **Secret scan (gitleaks, blocking)** | **hérité** | Commande du CI rejouée à l'identique (`gitleaks detect --no-git --source . --config .gitleaks.toml`) sur `origin/main` pur **et** sur la branche : listes de findings **byte-identiques** (`diff` vide, 14/14). Tous dans des captures HTML de pages tierces déjà commitées (`docs/parity/baseline/snapshots/**`, `docs/deploy-evidence/**`) et un bundle vendor (`public/ecode-static/assets/vendor-xterm-*.js`). Aucun dans un fichier ajouté par cette PR. Contrôle complémentaire sur la plage de commits : `gitleaks detect --log-opts=origin/main..HEAD` → **aucun secret**. |
| **Playwright local stack** (E2E) | **hérité** | Échoue sur **6 PR ouvertes sur 6** (#109, #111, #112, #116, #124, #126), y compris des branches qui ne touchent ni l'infra ni le preview-proxy. Une suite partagée cassée, pas une régression de cette PR. |
| **Playwright desktop-1024 / 1440 / tablet-768 / mobile-390** (audit i18n live) | **hérité** | Étape `Run exhaustive EN/FR live audit`. Le workflow tourne sur toutes les PR sans filtre de chemins, et #126 — une branche marketing/IDE sans rapport avec l'infra — échoue sur le même job. Même famille de cause que Production CI : le résidu de copie non traduite, dont cette PR ne change rien. |

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
