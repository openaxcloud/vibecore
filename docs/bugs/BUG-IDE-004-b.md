---
id: BUG-IDE-004
---

## Bug

**Éditeur — conflit de sauvegarde avalé silencieusement (perte d'édition).** Quand le fichier a changé côté serveur depuis son ouverture, la sauvegarde est refusée (protection légitime) mais **l'échec ne sort que dans la console** : l'onglet reste `●` sans message, sans bandeau, sans Recharger/Écraser/Diff, et l'édition n'est persistée **nulle part**. Déclencheur réaliste : le reseed/reconcile qui réaligne le runtime sur le project storage réécrit des fichiers ouverts.

## 📤 Dispatché

✅

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**LE CONFLIT A ENFIN UNE SORTIE.** Le garde de concurrence protégeait le fichier distant en sacrifiant le travail de l'utilisateur : mesuré le 06/08, l'onglet restait sale après le bouton Save, Ctrl+S ET Cmd+S, et l'édition n'était persistée dans AUCUN des trois magasins. Chaque tentative échouait, indéfiniment. Trois pièces : (1) l'erreur porte un CODE (`REMOTE_FILE_CHANGED`) — l'interface ne reconnaît plus un conflit à une phrase traduite, qui changerait de sens à la première retraduction (règle 5) ; (2) `onRemoteConflict: 'overwrite'` écrit la version de l'utilisateur, **jamais automatiquement** — seul un geste explicite devant un message qui explique peut l'armer ; (3) une notification qui NE SE FERME PAS SEULE, nomme le fichier et propose « Écraser avec ma version ». Le bouton d'un onglet inactif passe désormais son propre chemin, sinon l'invite parlerait du mauvais fichier. Contre-épreuve dans 2 sens : sortie retirée → rouge ; code d'erreur retiré → 2 rouges. La voie `reconcile` de l'agent est vérifiée intacte. épinglé par `app/lib/stores/files.conflit-sortie.spec.ts`

