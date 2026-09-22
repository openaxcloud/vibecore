---
id: BUG-ALIAS-TROIS-TABLES-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Dette de conception — TROIS vocabulaires d'alias de panneaux, à trois étages, dans trois fichiers.** Aucun n'est fautif isolément, et le troisième est un choix assumé par son auteur ; le coût est qu'il faut connaître les trois pour raisonner sur « quel panneau s'ouvre ».

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

**Relevé le 14/09, les trois emplacements :** ① `IDE_PANEL_ALIASES` (`app/lib/ide/panel-registry.ts`) — ce qu'une clé d'URL `?panel=` désigne ; ② `MOBILE_TOOL_ALIASES` (`app/lib/mobile-tab-meta.ts`) — ce qu'un id d'outil mobile désigne ; ③ `PROJECT_EDITOR_TOOL_ALIASES` (`app/components/chat/project-editor-tool-catalog.ts`, **apportée par #379, pas encore sur `main`**) — quel outil POSSÈDE l'écran, avec sa sous-vue (`domains` → `deployments`, vue `domains`). Les deux premiers répondent « quel panneau », le troisième « qui l'affiche » — axes différents, d'où l'absence de contradiction. **Les trois sont désormais gardés par `app/lib/ide/portes-des-panneaux.spec.ts`**, le troisième avec une abstention DÉCLARÉE tant que la table n'est pas sur `main` (elle ne passe pas au vert en croyant avoir vérifié). ⚠️ Ce qui coûtera dans six mois : personne ne se souviendra qu'il y en avait trois. C'est consigné pour ça.

