---
id: BUG-IDE-SAVE-TARGET-RENDER-001
---

# Un rendu interrompu peut détourner édition et sauvegarde vers un autre fichier

## 📤 Dispatché

22 octobre 2026, base production 3680f4fa. Incident utilisateur rapporté : après créations, contenu du fichier de types collé dans le composant card. Aucun accès ni écriture sur ce projet par ce chantier. Le déclencheur précis du rendu dans cet incident reste à établir.

## 💻 Codé

Correctif isolé, non intégré : MobileCodeEditor modifiait propsRef pendant le rendu. Un rendu React suspendu pouvait donc remplacer les callbacks alors que le document précédent restait visible. La référence et la synchronisation du document sont désormais appliquées dans des layout effects au commit. Aucun changement BaseChat, Monaco, API, délai, retry ou permissions.

## ✅ Testé live

Non certifié en production. Contre-épreuve déterministe rouge sur source3680 : types.ts visible, rendu card.tsx suspendu, édition et Ctrl+S envoyés à card. Avec le correctif, 11 tests ciblés passent, sans omission, dont fin de transition, 12 créations/sauvegardes, autosave et sélection globale volontairement différente du document affiché. React/CodeMirror réels en jsdom ; disque simulé. Le handler BaseChat de production cible déjà explicitement paneDocument.filePath.

La sonde navigateur locale sur build historique s'arrête avant collage : le panneau Files n'était plus ouvert. Elle n'atteste pas le P0 ni sa correction. Aucun build ou suite générale locale supplémentaire. CI exacte et revue indépendante nécessaires. Aucune voie de réparation du projet via l'éditeur non corrigé n'est certifiée.

[Reçu et empreintes](editor-save-target-p0-2026-10-22/receipt.json).
