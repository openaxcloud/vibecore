---
id: BUG-NEWAPP-ERRORS-001
---

## Bug

**P1 — App fraîchement créée : erreurs dans le fil** (Avi, 08/09 08:2x, point 9).

## 📤 Dispatché

☑ 08/09

## 💻 Codé

🟡 09/09 — **vérification faite, et elle change la lecture** : le correctif du proxy d'aperçu (#507, `fa81c2b`, fusionné à 10:38) EST un ancêtre du SHA réellement servi en production (`bf3951b`, déploiement 1560 du 08/09 à 20:36 UTC — dernier déploiement réussi). Or Avi a observé les erreurs à **08:2x, soit avant même que `fa81c2b` existe** : son observation portait sur une production qui n'avait pas le correctif. Il faut donc une REPRODUCTION FRAÎCHE avant de conclure à un défaut restant

## ✅ Testé live

☐

## Preuve

comparaison de SHA faite le 09/09 (`git merge-base --is-ancestor fa81c2b bf3951b` → vrai). ⚠️ Reproduction live IMPOSSIBLE depuis cette session : la passerelle refuse le CONNECT vers `app.e-code.ai:443` (403, « policy denial »), mesuré et consigné

