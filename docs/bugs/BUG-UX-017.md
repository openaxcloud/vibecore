---
id: BUG-UX-017
---

## Bug

**P3 (a11y/IA) — `/settings` est un dialogue servi comme page : aucun `h1`, et le texte de chargement fuite dans le contenu accessible.** La route rend `ControlPanel` (dialogue Radix, `DialogTitle`) en pleine page : le dialogue a bien un nom accessible, mais le *document*, lui, n'a aucun titre de niveau 1, et le premier texte lu est « Chargement d'E-Code… ». Constaté sur les **3 formats**.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

✅ 19/08

## Preuve

Env d'audit, 3 formats : `h1` absent en 1440 / 768 / 390 ; `app/routes/settings.tsx:22-30` monte `<ControlPanel open …>` sous `ClientOnly`, `app/components/@settings/core/ControlPanel.tsx:358` fournit un `DialogTitle` et non un titre de document. ⚠️ **Non corrigé délibérément** : servir un dialogue comme page est une décision d'architecture d'information (garder le dialogue et lui ajouter un titre de document ? convertir la route en page pleine ? rediriger vers `/account-settings` ?) — même classe que **BUG-UX-015**, hors du périmètre « correction sûre à la racine ». Consigné pour arbitrage. **Certifié live 19/08** sur l'env de test redéployé (`web:de86d02bce`), aux **3 formats** : `h1`=1, enchaînement h1→h2 sans saut. Le panneau ne rend un `h1` que servi comme page (`asPage`) — en dialogue, `h2` reste correct. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/routes/settings-headings.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

