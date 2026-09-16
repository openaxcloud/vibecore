---
id: BUG-I18N-SCAN-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Une seule règle, DEUX allowlistes, et la seconde est invisible depuis la première.** `scripts/i18n/source-allowlist.json` est lue par `scan-source.mjs` ; `services/api/src/tests/app-public-copy.spec.ts` relance le même scanner **sans** cette liste et compare les trouvailles brutes à une copie inline qu'il porte lui-même (`allowedInternalFindings`). Déclarer un code machine dans le JSON rend `pnpm i18n:check` vert **et laisse la CI rouge** — sans que rien n'indique où regarder.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

**Mesuré le 09/09 sur #517** : le code `reason: 'espace-non-stabilise'` (`services/api/src/app.ts:15412`) déclaré dans le JSON ; `scan-source.mjs` exit 0, `baseline clean` ; et `Install, test, build, scan` rouge sur `app-public-copy.spec.ts`, plus `Quality Gates` rouge par ATTENTE sur ce job — deux checks rouges pour une cause. Coût : un cycle de CI complet et une PR bloquée. Corrigé côté symptôme (7f287e38f) en déclarant le code dans la liste que le test lit vraiment. **Correction réelle** : que le spec consomme `source-allowlist.json` filtrée sur son fichier, au lieu d'en tenir une copie. Note : son assertion d'égalité EXACTE (ligne 367) est saine — elle rougit dans les deux sens, entrée manquante comme entrée superflue.

