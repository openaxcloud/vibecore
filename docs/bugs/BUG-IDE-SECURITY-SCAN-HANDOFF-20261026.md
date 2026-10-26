---
id: BUG-IDE-SECURITY-SCAN-HANDOFF-20261026
---

## Bug

La CI #808 sur `65228339e` échoue trois fois sur `security-timeout preserves the execution outcome` : progression absente au lieu de running/timeout. Le run E2E `40279290009` termine en échec ; ses 518 cas comprennent 491 réussites directes, 26 ignorés et un échec final, sans exemption utilisée. Le statut success de la tranche collecte les rapports et ne signifie pas que ses tests sont tous verts.

Le test original passe isolément sur le build local de référence. Une contre-épreuve contrôlée retient la vraie réponse GET ide-state, démarre le POST de scan contrôlé, puis libère le remplacement de coquille : running disparaît et reste absent après 90 secondes simulées. Le composant Security détenait localement son état, son contrôleur et son cleanup ; le remplacement détruisait l’opération côté interface.

## 📤 Dispatché

26/10/2026 — correction autorisée dans le lot #808 après diagnostic reproductible. Worktree séparé `vibecore-execution-timeout` ; les lots de palette et les autres intégrations sont préservés.

## 💻 Codé

☐ — validation locale. Session transitoire indexée projet/espace/fenêtre au-dessus des coquilles : état, contrôleur, échéance originale de 90 secondes et progression sont conservés. Un seul POST concurrent ; les réponses tardives après annulation/timeout ne peuvent pas annoncer une réussite. Le panneau courant rafraîchit les résultats, sans callback d’une ancienne coquille. La progression ne recule pas lorsque l’horloge recule ; les erreurs de refresh synchrones/asynchrones sont capturées et le message de fin ne prétend pas une fraîcheur non démontrée.

Navigation vers un autre panneau : l’attente locale continue dans la même portée et peut être retrouvée. Annulation explicite ou sortie de portée : arrêt local et nettoyage des timers/contrôleur. Cela ne promet pas d’annuler un scanner déjà lancé côté serveur. Aucun stockage persistant, credential ou backend ajouté.

## ✅ Testé live

☐ — aucune recette production. 36 tests unitaires/provider/gardes AST, lint ciblé et typecheck web passent. Revue indépendante favorable après correction de deux réserves. Build unique, sources figées ; 7 E2E sur 7 passent au premier essai, zéro retry : test timeout original inchangé, deux échecs contrôlés existants, quatre remplacements couvrant timeout, completed, failed et cancelled. Échéance 30 secondes avant + 60 après remplacement, POST unique et réponses tardives vérifiés.

[Reçu, contre-épreuve et captures](ide-security-scan-handoff-2026-10-26/report.md). Le premier run CI rouge reste distinct ; aucun rerun manuel ni suppression d’assertion n’a été utilisé pour obtenir les résultats locaux.

## Limites

Comptes/projets synthétiques sur API/PostgreSQL locaux réels. Les réponses de scan et l’horloge sont contrôlées pour éprouver le contrat UI : ces tests ne prouvent pas une exécution de scanner/fournisseur réel, ni la sécurité d’un projet client. Pas de validation authentifiée en production ou Safari matériel. Les processus de test sont arrêtés ; les conteneurs locaux arrêtés sont conservés pour la recette de témoins coordonnée.
