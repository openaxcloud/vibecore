---
id: BUG-DEPLOY-002
---

## Bug

L'URL d'un déploiement FAILED (manifestes nettoyés) rend un 502 JSON brut `SERVER_DEPLOY_UPSTREAM_ERROR` au lieu d'une page « deployment failed » propre côté preview-proxy.

## 📤 Dispatché

✅

## 💻 Codé

✅ `523795af`

## ✅ Testé live

✅ **15/07**

## Preuve

Wake tri-état au proxy : 404 manager → **410** `SERVER_DEPLOY_NOT_LIVE` (JSON) + page HTML « This deployment is not live ». Prouvé live sur `d-cmrmb9igi…` ET `d-cmrmkmfck…`.

