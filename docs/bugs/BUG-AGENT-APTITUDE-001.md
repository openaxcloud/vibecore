---
id: BUG-AGENT-APTITUDE-001
---

## Bug

**Le critère d'aptitude d'un fournisseur n'était appelé NULLE PART.** `aptitude-fournisseur.ts` porte depuis son écriture la règle « un fournisseur qui rend zéro fichier sur une consigne de construction est inapte », avec ses quatre gardes et son spec vert — et son UNIQUE importateur était son propre spec. Mesuré avec témoin positif : `provider-fallback` est importé par cinq fichiers, `aptitude-fournisseur` par un. La plateforme continuait donc de compter comme une réussite un fournisseur qui répond `200`, produit du texte et n'écrit aucun fichier : l'utilisateur reçoit une application vide et le tour suivant repart sur le même maillon. Même motif que la garde d'honnêteté et la garde de troncature du même jour — une règle juste que rien n'appelle ne protège de rien.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

le constat de tour est calculé dans `onFinish`, seul point qui connaît les trois faits (mode, nombre de fichiers accumulé sur TOUS les segments, façon dont le flux s'est terminé) ; `termine` vaut `stop` et lui seul, un flux coupé n'établit rien. La conséquence passe par la table de santé existante (`markProviderUnhealthy`, motif `sterile`) plutôt que par une seconde marche de chaîne — `resolveRuntimeProvider` sait déjà écarter, avancer et échouer franchement. Corrigé au passage : le drapeau `emittedFileAction` devient un COMPTE (`fichiersEmis`) dont le prédicat DÉRIVE — un drapeau converti en `1` aurait fait décider un repli sur une mesure non faite. `decisionDeChaine` du même module reste délibérément NON câblé, et le code dit pourquoi : il refait le parcours de `resolveRuntimeProvider`. + épinglé par `app/lib/.server/llm/aptitude-fournisseur-cablage.spec.ts` (9 tests). Contre-épreuve dans les deux sens : conséquence retirée → 2 rouges ; compte redevenu un drapeau déguisé → 2 rouges ; état corrigé → 17 verts avec le spec du module. Portes : lint 0 erreur, typecheck vert, 8322 tests verts, build vert, i18n vert. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1599 de `deploy-main.yml` (SHA `55b8696a2`, qui contient le câblage `057f48fa4` — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA : `fournisseurInapte(constatDuTour)` ×1, `fichiersEmis` ×5, `'sterile'` ×1). `Helm upgrade` 13:52:49→13:57:12, `Verify rollout` ✅, `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent les images construites depuis ce commit ; rollback resté `skipped`. ⚠️ Déployer n'est pas vérifier : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

