---
id: BUG-QA1006-LIEN-DE-PARTAGE-CONTOURNE-LES-PLACES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Constat

**DÉCISION REQUISE (grille de prix) — un lien de partage de projet donne l'accès en ÉCRITURE à un nombre illimité
de comptes, sans compter les places du forfait. Une équipe Gratuite (1 place, invitation refusée) fait entrer six
collaborateurs qui écrivent dans le projet.**

### Mesuré (2026-10-06, vraie API, `main` d3d34ef4c)

`qa-2026-10-06/repro-lien-de-partage-places.txt`, produit par `repro-lien-de-partage-places.spec.ts.txt` :

```
témoin — invitation sur forfait gratuit (1 place) : 429 QUOTA_EXCEEDED
création d'un lien « member » 30 jours : 201
ami 1 … ami 6 : rachat 200 | lit le projet 200 | ÉCRIT 200
```

- `POST /projects/:id/collaboration/share-links` : rôle `viewer` ou `member` (borné, aucune élévation possible),
  validité jusqu'à 30 jours, usages illimités.
- `GET /collaboration/share-links/:token` : chaque compte qui ouvre le lien devient collaborateur du projet,
  sans aucun contrôle de `team.members`.
- Les invitations, elles, comptent les places depuis #650.

## Pourquoi c'est une décision, pas un correctif

Selon la grille d'Avi (Gratuit 1 place, Pro 5, Team 25), c'est un contournement. Mais un collaborateur de projet
n'est pas forcément une « place » : Replit distingue les collaborateurs d'un projet et les sièges d'une équipe. Il
faut décider :
1. un collaborateur de projet (en écriture) compte une place → le rachat du lien vérifie `team.members`, comme
   l'invitation ;
2. ou il ne compte pas → le dire dans la grille, et borner : nombre d'usages par lien, et peut-être lecture seule
   par défaut en Gratuit.

À regarder dans les deux cas : un collaborateur `member` peut lancer l'agent. Ses tours sont-ils facturés à
l'équipe propriétaire ? Point non mesuré.

## 📤

☐ décision d'Avi

## 💻

☐

## ✅

☐

## Preuve

Repro API ci-dessus. Point OUVERT, décision requise.
