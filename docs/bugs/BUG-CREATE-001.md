---
id: BUG-CREATE-001
---

## Bug

**P0 — un espace de travail bloqué en démarrage retient le quota et rend morte la création de TOUT autre projet.** Le quota `workspaces.active` compte PENDING/STARTING/RUNNING ; la réconciliation qui libère les créneaux orphelins traitait PENDING et STARTING comme vivants **sans borne d'âge**. Relevé simultanément dans les trois sources : API `ws-4cd306324217d298` **PENDING** depuis 15:19:42 inchangé — manager **STOPPED** à 15:30:09 — pod `workspace-ws-4cd306324217d298` **Running**. Sur l'offre gratuite (limite 1) ce seul créneau suffit : tout projet créé ensuite reçoit `429 QUOTA_EXCEEDED` au démarrage de son runtime. **Repro** : créer un projet, laisser un provisionnement échouer, créer un second projet → IDE ouvert, arbre présent, aucun aperçu, aucun message.

## 📤 Dispatché

☑

## 💻 Codé

☑ *(`e462b304`, PR #139 non mergée)*

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`parcours-prompt-1440.json`, `froid-vide-a1.json` ; requête en base des trois sources ; correctif `services/api/src/workspace-slot.ts` + 6 tests

