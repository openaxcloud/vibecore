---
id: BUG-QA-I18N-COUNT-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
annotation: "/002"
---

## Bug

**Compteurs collés et faux pluriels — trois occurrences, pas deux.** `{compteur}` et `{t(…)}` étaient des expressions JSX **adjacentes**, que React concatène sans séparateur : « 8fichiers ». Et le pluriel était fabriqué en ajoutant un **« s » anglais** à une chaîne traduite : « événement interne de routine**s** », « Segment**s** ».

## 📤

✅

## 💻

✅ `ed2b1022`

## ✅

✅

## Preuve

Clés plurielles par langue : compteur de fichiers (`baseChatAst.files.count`, **la clé existait déjà**), événements de routine, segments de patch, et « {n} fichier(s) de verrouillage détecté(s) » → vrai pluriel en/fr. **La 3ᵉ occurrence (revue de patch) a été trouvée PAR la garde générique du test, pas à la lecture** — d'où l'intérêt d'une garde de motif plutôt que d'une liste de cas.

