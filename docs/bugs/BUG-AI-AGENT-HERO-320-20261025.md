---
id: BUG-AI-AGENT-HERO-320-20261025
---

## Bug

Sur /ai-agent en français à320px, clair et sombre, la colonne du hero et ses actions dépassent de x16 à342,67px. Le document reste à320px : contrôler uniquement scrollWidth ne détecte pas ces boutons coupés. Les autres dépassements relevés sont des halos décoratifs, distingués dans les preuves.

## 📤 Dispatché

Mission UI globale, audit complémentaire de deux routes marketing ; fichier AIAgent.tsx comparé aux31PR ouvertes inspectées, sans chevauchement. Nouveau worktree isolé, aucun changement aux têtes #795 et lot tertiaire.

## 💻 Codé

☑ Fusionné normalement dans main par [#796](https://github.com/openaxcloud/vibecore/pull/796), commit `ea2ff01c5cf6ffc5116f6ae98e9aaa4a43a807af`. [Suivi de livraison distinct](https://github.com/openaxcloud/vibecore/actions/runs/40249728903) ; ce statut de code sur main ne vaut pas validation UI en production.

Correctif : grille une colonne explicitement contrainte, libellés CTA repliables et hauteur automatique avec minimum d’origine conservé, y compris md:min-h-14 pour neutraliser le md:min-h-0 du Button. Aucun texte, action, lien ni fonction retiré. Revue indépendante favorable au mécanisme, réserve de hauteur desktop corrigée ; build final, typage et recette compilée réussis.

## ✅ Testé live

Non. Chromium local et fixtures synthétiques. Aucun achat, compte, mutation cliente ou production authentifiée.

## Preuves

[Audit et limites](ai-agent-hero-2026-10-25/README.md). Avant :32géométries Agent/Entreprise,8parcours clavier/Retour et4groupes de démonstration. Contrepreuve DOM AgentFR320 :bord droit304px, texte intact. Recette compilée10099 :16casresponsive,4parcoursclavier/Retour et4groupesdémo réussis ; boutons FR320 contenus x16→304, libellés complets, hauteurminimale préservée768/1440. Quatre tests existants et lint ciblé verts.
