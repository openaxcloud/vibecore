---
id: BUG-UX-DATABASE-SEQUENTIAL-LOAD-001
---

# Le panneau Base de données recharge les données déjà reçues avant d’afficher la connexion

## 📤 Dispatché

Recette combinée main fc8a687e + #750 e996671 + #753 f06923ff. Dépendance à coordonner avec le chantier BaseChat ; aucune modification de ce fichier réservé dans le lot UX.

## 💻 Codé

Non corrigé. `ProjectDatabasePanel` reçoit `data` mais monte `DatabaseWorkbench` avec le seul `projectId`. Le composant enfant lance alors son propre `fetcher.load`. Proposition à vérifier ensemble : lui transmettre les données initiales normalisées, les afficher dès le montage, conserver les rafraîchissements et les erreurs, éviter de doubler le chargement initial. Ne pas augmenter le délai du test ni masquer le chargement par un faux contenu.

## ✅ Testé live

Reproduit localement au deuxième passage complet : le bouton DATABASE_URL est absent avant toute mesure de hauteur. Le premier BFF finit en 200 après environ 24 s ; un second BFF démarre 4,8 s plus tard et attend encore à l’échec. Le parent n’est plus busy mais l’enfant affiche Loading databases. Les appels API sont 200, certains en 7–9,5 s ; la relecture réelle confirme une variable et une connexion DATABASE_URL. La cause de la lenteur et l’identité avec la cause CI restent non démontrées.

Voir [la recette et les request IDs](ux-combined-fc8a687e-2026-10-21/README.md). Pas de certification production ou de correction validée.
