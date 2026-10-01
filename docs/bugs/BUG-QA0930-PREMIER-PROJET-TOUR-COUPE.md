---
id: BUG-QA0930-PREMIER-PROJET-TOUR-COUPE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (premier projet) — TRANSMIS, hors du périmètre de la session QA (relance instruite).
Pour une idée triviale, le premier tour de l'agent est coupé par la limite de sortie AU MILIEU d'un
fichier : l'application n'a ni `src/main.tsx` ni `src/App.tsx`, elle ne peut pas démarrer.**

Mesuré le 2026-09-30 sur la pile locale (`main` à `dfc23575c`, runtime webcontainer), compte de test
local, idée : « Une page unique avec un compteur et deux boutons plus et moins » :

- tour de **8 min 30** ; l'agent écrit **21 fichiers** (hooks, sparkline, statistiques, thème, raccourcis
  clavier, error boundary…) pour un compteur ;
- sa réponse (48 676 caractères) s'arrête au milieu de `src/components/SetValueForm.tsx`
  (`… htmlFor="target-value">\n Valeur cible (entier `) ;
- côté serveur (`GET /projects/:id/files`) : 21 entrées, `SetValueForm.tsx` absent, **aucun `main.tsx`
  ni `App.tsx`** — jamais annoncés par l'agent ;
- l'interface propose « Continuer la dernière demande ».

Deux causes mêlées : la sur-génération (le budget de sortie part dans des fichiers accessoires) et un tour
coupé qui laisse un projet non exécutable au premier essai d'un nouveau client.

## Repro

Pile locale, compte de test local : `/projects/new` → l'idée ci-dessus → attendre la fin du tour →
comparer les `filePath` des `boltAction` du fil (`GET /projects/:id/ide-state`, `state.chat`) à
`GET /projects/:id/files`.

## 📤

☐ à transmettre à la session « relance instruite »

## 💻

☐

## ✅

☐

## Preuve

Constat mesuré, pas de correctif de la session QA (sujet exclu) — point OUVERT.
