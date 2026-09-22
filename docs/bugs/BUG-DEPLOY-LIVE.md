---
id: BUG-DEPLOY-LIVE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug (mots d'Avi)

« **Quand je déploie, ça marche pas.** » Un déploiement lancé depuis l'UI utilisateur n'aboutit pas.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve / état

**Non reproduit** — la repro bout-en-bout exige une session connectée (cookie `vc_session` en attente d'Avi). Erreur exacte non encore capturée ; aucune hypothèse de cause racine ne sera inscrite ici avant d'avoir le message d'échec réel. **LOT SENSIBLE** (deploy) : prouver, ne pas merger. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `services/api/src/static-deploy-base-path.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

