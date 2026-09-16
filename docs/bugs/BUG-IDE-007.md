---
id: BUG-IDE-007
---

## Bug

**P1 — l'arbre de fichiers reste désynchronisé et « Actualiser les fichiers » ne le répare pas.** Après la génération, la Bibliothèque annonce « **9 fichiers** » puis « 10 » après clic sur *Actualiser les fichiers*, pendant que le badge Git du même écran annonce « **20 fichiers modifiés** » et que le store projet en contient bien 20 (`GET /api/projects/<id>/files` → 20 entrées). L'utilisateur ne voit donc pas les fichiers que l'agent vient de créer, et l'action de rafraîchissement explicite ne corrige pas l'écart.

## 📤 Dispatché

☑ 16/09

## 💻 Codé

☑ 16/09 — **MÉCANISME, lu dans le code** : « Actualiser les fichiers » appelle `workbenchStore.loadRuntimeFiles('.')` → `FilesStore.reloadFromRuntime` → `GET /api/runtime/workspaces/:id/files?path=.` → arbre du POD, qui REMPLACE la carte du magasin (`files.set(nextFiles)`). La réconciliation stockage durable → pod (`reconcileRuntimeSeedFromPersisted`, correctif de BUG-AGENT-001 du 09/09) n'est déclenchée qu'UNE fois par workspace (`ReconciliationUneFois`), à l'ouverture, en arrière-plan : une désynchronisation survenue APRÈS — une génération dont des écritures n'ont pas atteint le pod — n'est jamais réparée, et chaque clic relit le pod amputé (9, puis 10) pendant que le stockage en a 20. **RÈGLE DU CORRECTIF** : un rafraîchissement demandé par l'utilisateur est une demande de RÉPARATION. Le contrat runtime gagne `listFiles(path, { reparer })` ; l'adaptateur distant envoie `&reparer=1` ; la route force la réconciliation (`ReconciliationUneFois.peutForcer`, une par 10 s et par workspace), l'ATTEND (bornée à 8 s, puis continue en arrière-plan) et liste ensuite — la réponse reflète l'état réparé. Les deux gestes de l'utilisateur la portent (bouton « Actualiser les fichiers » de la Bibliothèque, « reconnecter » de l'arbre) ; les relectures automatiques (~55 par session, mesuré) ne la portent pas.

## ✅ Testé live

☐ **Constaté live 15/08** — à revérifier sur `app.e-code.ai` après déploiement : après une génération, si la Bibliothèque compte moins que Git, un clic sur « Actualiser les fichiers » doit ramener les deux au même nombre.

## Preuve

Badges relevés dans le DOM : `Bibliothèque, 9 fichiers` → clic `Actualiser les fichiers` → `Bibliothèque, 10 fichiers`, avec `Git, 20 fichiers modifiés` au même instant. `GET /api/projects/cmsusbw8q00040nbf7dddmsq1/files` = 20 chemins (dont `src/App.tsx`, `src/components/*`, `src/index.css`). Desktop 1440.

**16/09 — épinglé par** `services/api/src/tests/actualiser-repare-le-pod.spec.ts` (API réelle contre un faux agent que le test AMPUTE : la relecture automatique rend le pod amputé et ne réécrit rien — le comportement du 15/08, contrôle — ; `reparer=1` réécrit les deux fichiers manquants AVANT de répondre et la réponse porte les trois ; un second clic dans les 10 s ne force pas deux fois), `services/api/src/reconciliation-une-fois.spec.ts` (forçage après l'ouverture, limitation, remise à zéro au reprovisionnement), `app/lib/stores/files.reload-content.spec.ts` (le magasin transmet `reparer`, une relecture automatique ne le demande pas, et les deux gestes de l'utilisateur le portent — lu dans `BaseChat.tsx` et `FileTree.tsx`).
