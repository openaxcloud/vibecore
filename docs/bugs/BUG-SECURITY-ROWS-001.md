---
id: BUG-SECURITY-ROWS-001
---

## Bug

**P2 — Sécurité sur téléphone : « Modérée / 0 active » sur 120 px par ligne**, et « Connecter une télécommande GitHub » (« remote » traduit en télécommande, trois chaînes). Capture 06/09 12:19.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — `PanelRows` porte des classes (`bolt-panel-row`, titre, détail), une paire par ligne sur téléphone (vaut pour Activité, Collaborateurs, Débogueur, Supervision, Paramètres, Intégrations) ; « dépôt distant » dans les trois chaînes. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§10) + `tests/e2e/ide-mobile-chrome.spec.ts` (Sécurité : lignes ≤ 48 px).

## ✅ Testé live

☐

## Preuve

Capture 06/09 12:19.

