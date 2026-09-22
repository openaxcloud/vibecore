---
id: BUG-USER-BUBBLE-HEIGHT-001
---

## Bug

**P2 — Bulle du message utilisateur : hauteur excessive, espace perdu en haut** (Avi, 08/09, point 6). Suivi de parité : `REPLIT_PARITY.md` RP-BUBBLE-01.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 09/09 — mesuré à 390 px : 42,9 px pour 19,9 px de texte ; les 7 px perdus venaient d'un conteneur d'images rendu sans condition (hauteur 0, `mb-2` quand même). Après : 35,9 px

## ✅ Testé live

☐ live iPhone

## Preuve

preuve live 09/09 (42,9 → 35,9 px) + épinglé par `app/components/chat/UserMessage.bulle.spec.tsx`

