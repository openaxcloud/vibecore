# WORKSPACE_STORAGE_CONTRACT — stockage du workspace projet (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat du stockage persistant d'un workspace (le disque du projet).

## Faits (cf. mémoire workspace-reattach + reopen non-destruction + Nix store)

- 1 PVC per-projet (100 Gi) monté dans le pod ws (`/home/project`). Réouverture =
  réattache le MÊME PVC ; pas de réinstallation.
- **Reseed non destructif** : la ré-hydratation récupère+valide l'archive AVANT
  d'effacer quoi que ce soit (`reseedWorkspacePreservingOnFailure`) — fini la
  fenêtre pod-vide. `node_modules`/`.git` exclus (`SNAPSHOT_IGNORED_DIRS`).
- Nix store RO partagé (candidat E) : mount RO kill-switch-gated ; unset =
  byte-for-byte pré-Nix.

## Invariants

- **I-WSS-1 (non-destruction)** : aucune opération de réouverture/reseed n'efface
  le disque avant d'avoir un remplacement validé en main. Certifié live.
- **I-WSS-2 (réattache sans réinstall)** : le PVC réattaché conserve
  `node_modules`/artefacts ; pas de `npm install` implicite.
- **I-WSS-3 (workdir stable)** : clé `/home/project` (pas `/workspace`) — sinon
  ENOENT au reopen.
- **I-WSS-4 (store RO immuable)** : le Nix store monté RO refuse toute écriture
  (prouvé sous gVisor) ; la mutation du store échoue.

## 🟡

Quota SSD prod (boot disks gVisor) = suivi séparé ([[project_ssd_quota]]) ; hors
périmètre de ce contrat.
