# PR #125 — attribution des échecs CI

Branche `fix/from-scratch-install-dr-clean`, SHA **`82603d55f7eac77c7cdcb8b1a5bc0f622c9c75bd`**,
rebasée sur `origin/main` = `b7ae0edc03`.

L'auditeur demande d'**isoler les rouges hérités des nouveaux, avec preuve par SHA**.
Chaque ligne ci-dessous est établie en rejouant la vérification *exacte* du CI sur
`origin/main` **pur** (export propre du commit, aucun fichier de la branche), ou en
comparant l'état du même job sur les autres PR ouvertes. Aucune n'est un « ça
échouait déjà, sans doute ».

## Ce tour-ci : un rouge était BIEN de la branche, il est corrigé — pas classé hérité

Au SHA `5e48c2bb60`, `Install, test, build, scan` échouait pour **deux** gardes
distinctes, toutes deux **imputables à la branche** — le rebase sur `main` avait
entre-temps réparé la dérive de baseline qui les masquait au tour précédent :

1. `pnpm run i18n:check` → `services/api/src/app.ts: new-file-debt (baseline=0,
   current=8)`. Les 8 sont exactement les champs `reason` du verdict fail-closed de
   `/internal/preview/port-access`.
2. `services/api/src/tests/app-public-copy.spec.ts` → même cause, garde
   indépendante de l'allowlist i18n.

Vérification d'imputabilité, pas de supposition : le **même scan sur l'`app.ts`
d'`origin/main`** est propre (`residual=14 in 2 files`, aucun `app.ts`), contre
`22 in 3 files` avec celui de la branche. Corrigé aux commits `5e48c2bb` (entrée
d'allowlist ciblée, fichier + règle + motif exact — pas un rebaselinage qui aurait
absorbé de la vraie dette) et `82603d55` (liste explicite de la garde de l'API).

**Une fois ces deux-là corrigés, `Production CI` échoue plus tôt, sur `Lint`** — et
celui-là est bien hérité, avec la preuve la plus directe possible : `app/root.tsx`
est **byte-identique à `origin/main`** dans cette branche (`git diff origin/main...HEAD
-- app/root.tsx` est vide), et le run `Production CI` de **`main` lui-même**
(`722a224c36`, 2026-08-12T06:18Z) échoue sur **exactement** la même ligne :

```
/home/runner/work/vibecore/vibecore/app/root.tsx
  36:1  error  Expected line before comment  @blitz/lines-around-comment
✖ 28 problems (1 error, 27 warnings)
```

Même compte de problèmes, même règle, même position. Le corriger ici serait une
correction de `main` glissée dans une PR d'infra — c'est signalé, pas emporté.

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
