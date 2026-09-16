---
id: BUG-PROBLEMS-STALE-START-001
---

## Bug

**P2 — Problèmes garde les erreurs d'un démarrage raté pendant que la Webview sert l'application** (capture 06/09 14:11 : « failed to load config from /workspace/vite.config.ts », « error when starting dev server: », « Cannot find module '@vitejs/plugin-react' » à 14:11, application servie sur 5173 à 14:10) ; l'en-tête « error when starting dev server: » est une erreur vide à part ; cinq « npm warn install-scripts / deprecated » comptés comme avertissements du projet. Le tampon de journaux est append-only : rien ne retirait un raté de démarrage.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé run 1498 (abaa279), 12:35 UTC** — `buildRuntimeDiagnostics` : une ligne « prêt » du serveur (« ready in », « Local: http », « listening on »…) périme les erreurs journalisées avant elle (jamais le signal « page blanche ») ; l'en-tête qui finit par « : » est fusionné avec la ligne suivante ; le bruit d'installation npm est laissé aux Journaux. Épinglé par `app/lib/stores/diagnostics.spec.ts` (5 cas, rouge 4/5 sans le correctif).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:11.

