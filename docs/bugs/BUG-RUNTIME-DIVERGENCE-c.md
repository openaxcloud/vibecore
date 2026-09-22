---
id: BUG-RUNTIME-DIVERGENCE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

(mise à jour) **REPRODUIT EN RÉEL, déterministe.**

## 📤 Dispatché

✅

## 💻 Codé

✅ branche `fix/runtime-divergence-seed-marker` (**non mergée**)

## ✅ Testé live

✅ **12/08** défaut reproduit live

## Preuve

**Repro** : projet ouvert, pod **chaud**, aperçu **vivant sur 5173**, storage **inchangé**. Témoins posés dans le pod : fichier `canary-reopen.txt`, `vite` PID **126**, `mtime src/App.tsx` **1786514795**. Geste d'Avi = rouvrir l'URL de l'IDE. **Après le reopen** : `canary-reopen.txt` **SUPPRIMÉ** (l'arbre entier a été effacé), `vite` PID **201** (dev server tué puis redémarré à froid), `mtime src/App.tsx` **1786515291** (fichier réécrit depuis le storage). `node_modules` conservé (41), conforme à l'exclusion prévue. C'est exactement « ça recharge et reconstruit le projet ». **Cause racine** : `seededWorkspaceSessions` est une Map de portée module, vide à chaque chargement de page → `seededThisSession=false` → branche destructrice systématique. Correctif = marqueur de seed **durable** portant la révision (26/26 tests, paire rouge→vert). **LOT SENSIBLE : PAS mergé.**

