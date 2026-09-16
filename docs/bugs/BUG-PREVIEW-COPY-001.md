---
id: BUG-PREVIEW-COPY-001
---

## Bug

**P2 — carte de démarrage de la Webview : « Démarrage de Démarrage de l’aperçu… »** (capture 05/09 23:05). `idePanels.preview.startingCommand` = « Démarrage de {label}… » reçoit un libellé qui commence déjà par « Démarrage de l’aperçu » (`workbenchRuntime.preview.starting`). Deux gabarits emboîtés.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 06/09 (`main`) — `preview-start-status.ts` : seule la commande enregistrée dans `previewServerState.command` est enveloppée ; une phrase de statut passe telle quelle. Épinglé par `app/components/workbench/preview-start-status.spec.ts`.

## ✅ Testé live

☐

## Preuve

Capture iPhone 23:05.

