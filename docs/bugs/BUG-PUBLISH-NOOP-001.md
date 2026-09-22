---
id: BUG-PUBLISH-NOOP-001
---

## Bug

**P1 — « Republier » ne lance AUCUN déploiement : le bouton renvoie vers l'onglet « Gérer »** (Avi, 09/09 10:32, captures iPhone prod : « quand je clique sur publish ça lance pas le déploiement ça me renvoi vers gérer »). Le bouton principal du panneau de Publication — celui que j'ai posé — n'exécute donc pas ce qu'il annonce.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

MESURÉ : `BaseChat.tsx` passait `onRepublier={() => setTab('manage')}` — le bouton ne faisait QUE changer d'onglet. Il envoie désormais l'intention `redeploy` sur le dernier déploiement, par le MÊME chemin que l'onglet Gérer (`POST /api/projects/:id/ide-panel/deployments`). Sans historique il n'y a rien à rejouer : l'assistant s'ouvre, et le libellé dit déjà « Publier ». Contre-épreuve dans les deux sens (remise du `setTab` → rouge ; intention changée en `rollback` → rouge). épinglé par `app/components/deploy/publication-republier.spec.ts`

