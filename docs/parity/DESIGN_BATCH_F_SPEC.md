# Batch 5 — F1–F30 : SPEC (validation du commanditaire, source de vérité)

> Spec complète référencée : `BATCH-5-F1-F30.md` (chercher dans le repo). Ci-dessous le résumé exécutable approuvé lors de la validation du commanditaire. Règles globales identiques : tokens obligatoires, orange=marque/bleu=action, --status-* pour états, composants ui/ d'abord, un commit par point, zéro violet, zéro changement hors périmètre. Audit : 7/30 déjà landés — vérifier chaque point avant de le refaire.

## IDE / projet
- **F1** Ports : badge process + toggle Public/Private + copy URL (`PortDropdown.tsx` à vérifier).
- **F2** Verrous de fichiers visibles dans le tree + « Request unlock » (`LockManager.tsx`).
- **F3** Inspector → « Open source » fichier:ligne (`Inspector.tsx`).
- **F4** Activity : chips par type/membre + liens profonds (`BaseChat.tsx:11601`).
- **F5** Security scanner : par finding « Fix with Agent » / « Ignore » avec raison (`BaseChat.tsx:16130`).
- **F6** Project memory : édition inline + toggle par entrée (`BaseChat.tsx:12779`).
- **F7** Console : `file.ts:12:5` cliquable → éditeur à la ligne.
- **F8** Object storage : browser + upload drag-&-drop + URL signée 1h + quota (barre C9).
- **F9** Workflows : runs (statut, durée, déclencheur) + « Run now » + logs par étape (pattern E23).
- **F10** Integrations : permissions listées AVANT connexion + révocation (pattern C15).

## Env / deploy / accès
- **F11** Env vars : scopes Dev/Preview/Prod + vue diff entre scopes.
- **F12** Domains : wizard DNS 3 étapes + re-check live + statut SSL.
- **F13** Project settings (`projects.$projectId.settings.tsx` existe) : rename slug avec redirect 30 j + Danger zone bordée --err (saisie du nom pour Delete).
- **F14** Collaborators projet : rôles View/Edit/Admin + lien d'invite expirable.

## Enterprise
- **F15** SSO (`enterprise-sso-settings.tsx` réel, sans prefill par design — à respecter) : « Test connection » dry-run + « Enforce SSO » avec grace 7 j et exemption owner ; ne jamais renvoyer les secrets.
- **F16** SCIM (`scim-token-settings.tsx`) : rotation en 2 temps, ancien token valide 24h, « Last sync » + users provisionnés.
- **F17** Teams : access log par équipe + export CSV (réutilise D4).

## Admin
- **F18** AI providers : ordre de fallback ↑↓ + latence p95 / erreurs 24h (warn ≥2 %, err ≥5 %) — au-delà du ToggleListPanel existant (`admin.$section.tsx:2093`).
- **F19** AI models : matrice plan × modèles + coût /1M tokens ; ≥1 modèle actif par plan.
- **F20** Credit wallets : ajustement signé + raison OBLIGATOIRE → audit + historique des mouvements.
- **F21** Agent checkpoints : stockage total/org + règles de purge + purge manuelle avec estimation.
- **F22** Abuse events : Dismiss / Warn (template email) / Suspend (raison → audit, réutilise E26) + statut.
- **F23** Security events : sévérité + timeline + « Mark resolved » avec note ; compteur open en sidebar.
- **F24** Account deletions : file (purge J+14, cohérent E14) + « Cancel deletion » + export.
- **F25** Previews : TTL restant + kill par ligne + TTL par défaut dans System settings.
- **F26** Costs : barres coût/jour 30 j par provider + budget mensuel avec alertes 80/100 % (seuils C9).

## Marketing / global
- **F27** Changelog : page réelle (entrées taguées New/Improved/Fixed, RSS) — le menu pointe vers la page générique.
- **F28** Mobile IDE : cibles ≥44px, swipe entre onglets (`bolt-mobile-tab-switcher`, `BaseChat.tsx:7939`), safe-area iOS.
- **F29** Landing : `loading="lazy"` + width/height sur images below-fold (sections déjà différées — `DeferredSections.tsx`).
- **F30** Empty states IDE unifiés sur EmptyState (C7) avec CTA contextuel.

## Vérification (avant de dire un point « fait »)
typecheck+lint+test verts · captures clair+sombre 1440/768/390 des surfaces touchées · zéro violet/zéro window.confirm natif · chaque point prouvé fichier:ligne · état réel par point dans `DESIGN_AUDIT_LIVE.md`.
