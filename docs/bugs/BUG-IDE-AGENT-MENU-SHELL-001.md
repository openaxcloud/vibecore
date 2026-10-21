---
id: BUG-IDE-AGENT-MENU-SHELL-001
section: "IDE — initialisation et persistance"
---

## Bug

Le menu agent ouvert dans PendingComposerShell perd son ouverture et son focus
lorsque ChatImpl remplace cette coquille. Le composant est réellement démonté ;
la correction clavier de #750 ne transfère pas son état au nouveau composant.

## 📤 Dispatché

☑ — 21 octobre 2026, coordination des PR #749 et #750.

## 💻 Codé

☐ — candidat sur branche locale d'intégration : provider au-dessus des shells,
porté par projet, workspace et fenêtre. HeaderOverflowMenu accepte un état
contrôlé optionnel ; les autres usages conservent leur état local. L'action
focalisée est restaurée en phase layout. Pas de cache global ou de réouverture
après sortie de la route. Aucune fusion main ni publication de merge.

## ✅ Testé live

☐ — test de remplacement réel rouge avant correction (1 échec/5), puis 5/5
unitaires verts. Recette navigateur FR/EN créée : ouverture ou fermeture avant
libération du GET réel ide-state, preuve du remplacement du nœud et du message
synthétique persisté, contrôle du menu/focus et Escape. Résultats navigateur
encore à acquérir ; aucune certification de panneau.
