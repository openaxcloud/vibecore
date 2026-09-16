---
id: BUG-IDE-014
---

## Bug

**P2 — « Domaines » est offert deux fois dans l'IDE : comme carte autonome de la grille des outils ET comme onglet du panneau Déploiements.** Signalé par Avi le 2026-09-02, captures à l'appui. **Mesure : ce ne sont PAS deux implémentations** — le même composant `ProjectDomainsPanel` est monté deux fois, en mode « framework » (porteur de panneau) pour la carte autonome et en mode « self » (`projectId`) pour Deploy → Domaines ; les deux passent par `/api/projects/:id/ide-panel/domains` → `/orgs/:orgId/domains`, mêmes intents `create`/`verify`/`configure`. **Aucune fonction n'est perdue en retirant la carte autonome.** Aggravant : l'écran autonome est un cul-de-sac avant le premier déploiement — il affiche lui-même « The CNAME/A instructions unlock after the first successful deployment ».

## 📤 Dispatché

✅ **02/09**

## 💻 Codé

☑ **PR #379** (branche `fix/ide-domains-duplicate-entry`, NON mergée)

## ✅ Testé live

☐ **à prouver en prod**

## Preuve

**Régression de gouvernance, pas de code** : un commentaire de `BaseChat.tsx` affirmait « The standalone Domains panel is removed from the Add-tab selector so this is the single place » — vrai à l'écriture, puis **RPL-IDE-001.5** a reconstruit la liste d'outils depuis le catalogue partagé et a **remis** la carte `domains`, **sans un seul test rouge** (méthode, règle 15 : un commentaire ne retient rien). **Correctif (option « raccourci » d'Avi)** : `domains` devient un **alias** (`PROJECT_EDITOR_TOOL_ALIASES`) — identifiant de panneau toujours valide (`?panel=domains`, dispositions persistées, feuille Outils mobile), résolu à l'ouverture en `deployments` + onglet `domains` ; la **grille** perd sa carte, les surfaces de **recherche** la gardent comme raccourci ; les deux sites d'appel (`openWorkspacePanel`, `activateMobileTool`) délèguent à `resolveProjectEditorToolOpen`. **Menu bas mobile/tablette conservé tel quel** (l'entrée reste, sa destination change). Aucun composant supprimé ; la branche `panel === 'domains'` reste, documentée, pour les dispositions persistées AVANT l'alias. **Épinglé par `app/components/chat/project-editor-tool-catalog.spec.ts`** (18/18) **et `app/lib/stores/deploy-panel-view.spec.ts`** (4/4). Contre-épreuve dans les deux sens (règle 6) : table d'alias vidée → 3 rouges ; `domains` supprimé au lieu d'aliasé → 3 rouges (« hidden, not deleted ») ; demande d'onglet retirée du résolveur → 2 rouges.

