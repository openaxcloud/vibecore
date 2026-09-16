---
id: BUG-THEME-009
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — Zone CONNECTÉE, thème CLAIR : les libellés d'état succès/avertissement passent juste sous AA** — « save €10.00 » sur `/billing` (4.21:1) et les bandeaux « … not enabled for this organisation » (4.10–4.25:1), aux 3 formats ; en sombre 7.8–10.8:1.

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

**Cause racine** : `--status-success-text: #178a4c` et `--status-warning-text: #b45309` (bloc clair) sont lus non pas sur du blanc mais sur les surfaces d'état teintées (`#f9fafc`, warm `#f2e6dd`), où ils tombent sous 4.5:1. **Correctif** : `#157f45` et `#a04a08` (≥ 4.93:1 sur ces surfaces).

