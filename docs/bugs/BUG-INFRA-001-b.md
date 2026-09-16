---
id: BUG-INFRA-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**`allow-dns-clusterip` n'est dans aucun chart Helm** — elle n'existe que dans `scripts/audit-env/addons.sh`. Sur ce datapath (Calico classique), sans elle **toute résolution DNS échoue** (`EAI_AGAIN`) et la plateforme ne démarre pas : API `/ready` 503, Redis `ETIMEDOUT`, workspaces incapables d'atteindre le registre npm. Un `helm upgrade` l'a fait disparaître du namespace `vibecore` et elle n'a jamais existé dans `workspaces`.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☐

## ✅ Testé live

✅ **12/08** reproduit et corrigé sur l'env de test

## Preuve

Constat live : depuis le pod api, connexion **directe à l'IP** de Redis `OK 10.30.14.16:6379` mais résolution du **nom** `EAI_AGAIN` / `resolve4 ETIMEOUT` ; `/etc/resolv.conf` pointe `10.30.0.10`. Après application de la policy dans `vibecore` puis `workspaces` : DNS rétabli (`registry.npmjs.org → 104.16.7.34`), API prête, install npm aboutie. Idem constaté pour `API_CORS_ORIGINS`, absente du chart et disparue du secret → API en CrashLoop `Production startup blocked`. **Ces deux clés vitales vivent hors des charts** : une réinstallation à neuf ou un `helm upgrade` malheureux casse la plateforme. Lot **SENSIBLE** (infra) — à remonter à l'expert.

