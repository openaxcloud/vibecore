---
id: BUG-WEB-001
---

## Bug

**P1 (lancement) — `www.e-code.ai` n'est déclaré dans aucun ingress : erreur de certificat puis 404.** Le DNS existe pourtant déjà (`www.e-code.ai` CNAME → `e-code.ai` → `34.1.6.93`), mais l'ingress ne déclare que `app.`, `e-code.ai`, `api.`, `workspace-manager.` et `*.preview.`. Le certificat ne couvrant pas `www`, un navigateur qui tape « www » se prend une **erreur TLS avant même le 404**. C'est ce que les gens tapent au lancement.

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

💻 **Codé (PR #141, branche `fix/ingress-www-apex-redirect`, SHA `1e9765d7a9`) — inerte par défaut, NON activé en prod**

## ✅ Testé live

☐

## Preuve

Mesuré en prod : `curl https://www.e-code.ai/` → **HTTP 000** (erreur de certificat) ; avec `-k` → **404**. Correctif : annotation `from-to-www-redirect` sur l'ingress applicatif + hôte `www.<marketingDomain>` dans le bloc TLS. **Choix mesuré en réel sur le cluster d'audit (même ingress-nginx 1.15.1 que la prod)** : `permanent-redirect` avec `$request_uri` est **refusé par le webhook d'admission** ; avec une URL nue il **perd le chemin** (`/pricing` → racine) ; `from-to-www-redirect` **préserve chemin et query** (`/pricing?x=1` → `Location: https://<apex>:443/pricing?x=1`). Les snippets nginx sont désactivés depuis ingress-nginx 1.9 (CVE-2021-25742), sans override en prod. Écarts assumés : code **308** et non 301 (défaut contrôleur `http-redirect-code` ; le forcer à 301 serait un réglage GLOBAL), et `:443` dans le `Location` (cosmétique). ⚠️ **Activation non faite** : elle ajoute `www` aux SAN du certificat principal → **réémission cert-manager** couvrant apex + app + api + workspace-manager. Une seule ligne de values, **à arbitrer par Avi**. `helm lint` vert dans les deux modes ; rendu Helm prod inchangé tant que `marketingWwwRedirect: false`.

