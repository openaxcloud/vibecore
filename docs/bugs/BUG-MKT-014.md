---
id: BUG-MKT-014
provenance: "extraite de la proposition #116, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P1 — la désinscription à la newsletter ne désinscrit personne.** `/newsletter/unsubscribe` et `/newsletter/confirm` rendent des pages **statiques** : le `?token=` est ignoré, aucune action n'est déclenchée, aucun contrôle n'est affiché. Vérifié : sans jeton, avec un jeton bidon, le rendu est **identique**. Côté API, seul `/newsletter/subscribe` existe — il n'y a ni endpoint de confirmation ni endpoint de désinscription, alors que le modèle porte déjà `unsubscribedAt`. Un abonné ne peut donc pas se désabonner.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

☐ **non corrigé — hors périmètre marketing**

## ✅ Testé live

☐

## Preuve

**NON CORRIGÉ VOLONTAIREMENT.** Le correctif exige un endpoint API avec jeton signé, sa génération dans le chemin d'envoi d'e-mails, puis le câblage de la page — cela traverse `services/api` et sort du périmètre de cette campagne. Signalé comme P1 : une désinscription non fonctionnelle a une portée réglementaire (RGPD art. 7(3), CAN-SPAM).

