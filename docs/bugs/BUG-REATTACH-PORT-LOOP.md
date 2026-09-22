---
id: BUG-REATTACH-PORT-LOOP
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Boucle

Exiger un port vivant. Le reseed **tue** le serveur de dev ; à la réouverture suivante vite n'a pas fini de redémarrer, donc `hasLivePort:false`, donc on reseede — **chaque reseed garantissait le suivant**. Attendre ne corrige rien (démarrage à froid = plusieurs secondes) : la ré-sonde bornée a été mesurée insuffisante puis **retirée**.

## 📤

✅

## 💻

✅ `e4869bc7`

## ✅

✅

