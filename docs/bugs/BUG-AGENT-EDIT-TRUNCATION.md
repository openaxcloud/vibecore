---
id: BUG-AGENT-EDIT-TRUNCATION
---

## Bug

**P0 perte de données** — une édition in-place de l'agent tronque le fichier : le `});` de fin disparaît, un fragment `</bo` reste, le JS devient invalide (constaté 2/2, déterministe). Cause racine MESURÉE : `StreamingMessageParser` (`app/lib/runtime/message-parser.ts`), branche de streaming `else` (balise fermante pas encore complète) émettait `input.slice(i)` **verbatim**, y compris une `</boltAction>` **partielle coupée entre deux chunks** (`…});\n</bo`). Cette valeur alimente l'aperçu éditeur ET l'autosave. Quand la sortie du modèle est **tronquée en pleine balise** (arrêt sur `</bo`), `onActionClose` — seul à retirer la vraie balise — ne se déclenche jamais → le `</bo` est ce qui est persisté. Défaut classique du délimiteur coupé entre chunks.

## 📤 Dispatché

✅ 17/07

## 💻 Codé

✅ `0e0017ae`

## ✅ Testé live

✅ 24/07 (re-vérifié 10/08)

## Preuve

Fix `withoutTrailingCloseTagPrefix()` : retient le plus long suffixe qui est un préfixe propre de `</boltAction>`, sur les branches `file` ET `diff`. Preuve sur le parser RÉEL, cas exact 2/2 : **AVANT** `saved="…setup(server);\n</bo"` sha `26bb7dc9…` **ne parse pas** (`Unexpected token '<'`) → **APRÈS** `saved="…setup(server);\n"` sha `ca6fb623…` **parse OK**, `});`+tail préservés. Cas dur (fichier long + accents/CJK/emoji, balise splittée en 2 chunks) : `onActionClose` byte-exact. Tests de non-régression qui **ÉCHOUENT sans le fix** (2/2 sur l'assertion `not.toContain('</bo')`) ; **63/63** specs message-parser + 3 enhanced verts. Artefacts : `docs/deploy-evidence/2026-07-17-agent-truncation/`. **✅ Testé live 24/07** : le parser déployé (web prod `6d57a401`) est **byte-identique** à HEAD (`git show 6d57a401:…message-parser.ts \

