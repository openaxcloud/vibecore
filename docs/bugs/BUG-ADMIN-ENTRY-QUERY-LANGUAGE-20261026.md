---
id: BUG-ADMIN-ENTRY-QUERY-LANGUAGE-20261026
---

## Bug

L’entrée `/admin?lang=fr` perd sa langue pendant le redirect vers `/admin/overview`, qui affiche alors « Admin overview » dans le reçu navigateur synthétique before13199.

## 📤 Dispatché

☑ 26/10/2026 — Défaut issu de l’audit Administration ; correction isolée autorisée après inspection des PR ouvertes.

## 💻 Codé

☐ Sur main. `admin._index.tsx` reporte uniquement le paramètre `lang`, encodé, sur la même destination. La garde `requirePlatformAdmin` reste attendue avant de construire la réponse. Aucun changement de droits, de route métier ni de composant partagé.

## ✅ Testé live

☐ En production. Contrat GET du loader local avec garde synthétique, aucune API réelle ni compte administrateur utilisé.

## Validation locale et preuves

[Diagnostic et tests](ui-admin-entry-language-2026-10-26/README.md) : avant deux échecs FR/EN et deux réussites ; après quatre tests réussis, lint/Prettier verts. Paramètres sans rapport non transmis et refus d’autorisation conservé. Pas de nouveau build ou navigateur pour ce redirect pur ; aucune certification globale des pages Administration.
