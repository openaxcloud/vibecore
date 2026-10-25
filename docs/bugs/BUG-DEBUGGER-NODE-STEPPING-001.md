---
id: BUG-DEBUGGER-NODE-STEPPING-001
---

# Débogueur Node : moteur pas-à-pas privé

## Bug

**Les commandes pas-à-pas restent désactivées et aucun moteur ne fournit les pauses, la pile et les variables.** Les lots #779 et #780 assurent le lancement/arrêt suivi et la sauvegarde CAS ; ils ne réalisent pas le débogage.

## 📤 Dispatché

25 octobre 2026, lot distinct `feat/node-step-debugger`, base main `941d7d7fc`. Moteur agent, transport API et panneau développés en parallèle ; revue indépendante. Aucun changement sur les PR #768/#764, la restauration cloud ou les intégrations.

## 💻 Codé

Correctif local validé, non fusionné. Adaptateur Node pour fichiers JavaScript locaux ; transport Inspector privé par descripteur hérité, sans port réseau. L'identité de session est persistée avant lancement ; la compensation d'arrêt et les conflits CAS restent explicites. Les commandes non idempotentes ne sont pas rejouées automatiquement après une réponse incertaine.

## ✅ Testé live

Non exécuté en production. Les tests isolés utilisent exclusivement des fichiers et processus synthétiques ; résultats et limites dans [VALIDATION.md](debugger-node-stepping-2026-10-25/VALIDATION.md). La session de recette production déconnectée ne constitue aucune preuve live.

## Périmètre et limites

Le parcours concerne Node JavaScript (.js/.mjs/.cjs). Il ne certifie pas Python, le navigateur, TypeScript/source maps ou l'attachement à un processus arbitraire. Les fonctionnalités non prises en charge doivent produire une erreur explicite. Aucun nouvel accès persistant, secret, port public, permission ou ressource payante.

## Parcours de recette isolée

Créer un programme `debug-example.cjs` dans un workspace de test :

```js
function increment(value) {
  const next = value + 1;
  return next;
}
const initial = 41;
const result = increment(initial);
console.log(result);
```

Dans Débogueur, enregistrer une configuration avec le programme `debug-example.cjs`, la commande vide et « Stop on entry » coché. Ajouter un point d'arrêt sur la ligne 6 et une expression surveillée `initial`, puis lancer cette configuration. Continuer jusqu'au point d'arrêt, entrer dans `increment`, observer `value`, avancer sur `next`, sortir de la fonction et continuer jusqu'à la sortie. Refaire une session et l'arrêter pendant une pause. Les changements de points d'arrêt et d'expressions s'appliquent au prochain lancement.

Le résultat attendu provient du runtime : changement des positions de pile et valeurs, sortie du vrai processus, puis arrêt confirmé. Un statut « unknown », une erreur de transport ou un conflit CAS n'est jamais une preuve de succès. Après une réponse de commande incertaine, relire l'état avant toute nouvelle commande ; le transport ne rejoue pas le pas automatiquement.
