---
id: BUG-QA-AGENT-TRUNCATION-002
---

## Bug

**P1 (requalifié le 12/08 — corruption TRANSITOIRE, pas permanente) — Un fichier généré par l'agent est écrit ET committé tronqué pendant plusieurs minutes : le projet est syntaxiquement invalide, l'aperçu casse, et l'agent annonce malgré tout un succès complet.** Prompt simple (« remplace src/App.tsx par un compteur de clics avec Incrémenter et Reset ») via l'UI réelle : l'agent génère, l'ActionRunner écrit, et le fichier écrit **s'arrête net sur `disab`** (au lieu de `disabled`). Résultat : JSX non fermé, accolades déséquilibrées (**7 `{` pour 6 `}`**), aucune fermeture de `export default`. Vite renvoie **HTTP 500** sur `/src/App.tsx` (`Unexpected token (36:0)`, babel-parser) et l'app ne s'affiche plus. **Le contenu tronqué n'est pas seulement dans le runtime : il est committé dans le stockage canonique du projet** — donc c'est le fichier de l'utilisateur qui est corrompu, pas un cache. Aucune erreur, aucun avertissement, aucun état « incomplet » n'est surfacé : côté UI la génération se présente comme terminée.

## 📤

☐

## 💻

☐

## ✅

✅ **12/08** reproduit live, clé LLM réelle

## Preuve

**Runtime** (`/workspace/src/App.tsx`, pod `workspace-ws-090fb06e5a098932`) : 960 o ; `curl 127.0.0.1:5173/src/App.tsx` → **500** avec `{"message":"/workspace/src/App.tsx: Unexpected token (36:0)\n  34 \

