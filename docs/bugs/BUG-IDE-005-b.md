---
id: BUG-IDE-005
---

## Bug

**Packages — l'action renvoie `{ok:true}` même quand le run échoue.** Le bloc `packages` retombe sur le `return json({ ok: true })` commun quel que soit `run.exitCode` ; l'échec n'est visible que dans « Install & runtime checks » de la sidebar, **sous la ligne de flottaison**. Le correctif BUG-IDE-001 supprime la cause d'échec mais pas le masquage.

## 📤 Dispatché

✅

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**MÊME MÉCANISME QUE BUG-GIT-001, corrigé le même jour — la règle, pas l'occurrence (règle 7).** Une action qui rate ne répond plus comme si elle avait réussi : le code de sortie du run décide de la réponse (`422 PACKAGE_RUN_FAILED` au lieu de `200 {ok:true}`), et le client a déjà tout ce qu'il faut pour l'afficher là où l'utilisateur a cliqué — son chemin d'échec lit `result.error`. Le message porte la CAUSE et pas un « échec » nu : les quatre dernières lignes de la sortie, là où les gestionnaires de paquets écrivent leur diagnostic (`E404`, registre injoignable…), bornées à 400 caractères. **Le refus vient APRÈS l'écriture de l'historique** — refuser avant perdrait la sortie, seule preuve de la cause ; une garde tient cet ordre. Contre-épreuve dans 3 sens : refus retiré → 2 rouges, sortie vidée du message → 2 rouges, refus déplacé avant l'enregistrement → 1 rouge. épinglé par `app/routes/packages-echec-non-masque.spec.ts`

