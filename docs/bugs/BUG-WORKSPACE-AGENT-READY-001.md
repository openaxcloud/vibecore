---
id: BUG-WORKSPACE-AGENT-READY-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

`WorkspaceManager.waitForAgentReachable` tente la santé HTTP de l'agent pendant
45 secondes par défaut, puis journalise `workspace.agent.unreachable_at_start`
sans rejeter ni retourner d'état d'échec. L'appelant peut donc poursuivre vers
RUNNING après une absence de disponibilité confirmée. Constat de code sur main
`44a8e01bc1010732cb5862c346071e4411d0511d`, confirmé dans le candidat courant ;
aucune occurrence live n'est affirmée.

## 📤 Dispatché

☑ Relevé pendant la contre-revue du protocole d'admission du 18 octobre.

## 💻 Codé

☐ Non corrigé. Un simple rejet dans le chemin legacy ferait passer la ligne
API en FAILED sans prouver que son pod a disparu : l'erreur honnête doit être
coordonnée avec l'arrêt et le comptage des ressources. Le protocole V2 permet
cette distinction, mais n'est pas activé. Reproduire avec un agent HTTP qui
reste indisponible, vérifier l'état retourné, le maintien du quota en cas
incertain et l'absence de suppression de PVC.

## ✅ Testé live

☐ Accès HTTP/cluster indisponible dans cet environnement. Les tests d'admission
locaux désactivent explicitement cette sonde et ne prouvent pas l'exécution
d'une application générée.
