---
id: BUG-QA-DB-IDE-BRICK-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**(P1) Un provisionnement DB échoué briquait l'IDE du projet.** L'onglet `database` est persisté côté serveur : à chaque ouverture il se remontait, relançait la boucle, et l'IDE ne finissait jamais de monter — sans aucune issue par l'interface. L'échec n'était reconnu que si la réponse **portait** un `error` ; un chargement qui n'aboutit à **aucune** donnée (route en échec, 5xx, réseau coupé) laissait un squelette perpétuel.

## 📤

✅

## 💻

✅ **`3b81b10b`**

## ✅

✅ **13/08**

## Preuve

Ce cas compte désormais comme un échec : l'erreur et le bouton **Réessayer** s'affichent, l'onglet redevient utilisable et fermable, le montage de l'IDE n'est plus retenu. Vérifié live : l'IDE monte, les onglets Base de données **et** Supervision coexistent et se ferment.

