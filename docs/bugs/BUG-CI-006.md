---
id: BUG-CI-006
---

## Bug

**P2 — le job « windows desktop build » échoue sur `main` pour une syntaxe d'environnement POSIX**, ce qui maintient la CI rouge et masque les vrais échecs. `'NODE_OPTIONS' is not recognized as an internal or external command, operable program or batch file` : le script `electron:build:renderer` du `package.json` préfixe la commande par `NODE_OPTIONS=…`, que `cmd.exe` ne sait pas interpréter. C'était le **seul** script du `package.json` dans ce cas.

## 📤 Dispatché

✅ 15/08

## 💻 Codé

✅ **corrigé** `dd3503bb`

## ✅ Testé live

☐

## Preuve

Log du job `95079378434` (run `31912408508`). Défaut **préexistant sur `origin/main`** (`package.json:96`), sans rapport avec le lot QA de la branche — confirmé : le diff de la branche ne touchait pas `package.json`. Correctif : préfixe `cross-env`, **déjà une dépendance** du dépôt (`^7.0.3`), dont c'est précisément l'objet. Reste ✅ à cocher quand le job passera vert sur la PR.

