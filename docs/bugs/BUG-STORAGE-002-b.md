---
id: BUG-STORAGE-002
---

## Bug

**P1 — l'egress vers le serveur de métadonnées, indispensable à Workload Identity, est ABSENT du chart : toute installation neuve repart avec un stockage d'objets cassé.** Le client Google prend son jeton auprès de `169.254.169.254` ; sans egress vers lui, `deny-all-default` le bloque, l'obtention du jeton part en timeout et **tout** appel GCS échoue. **La PRODUCTION n'est PAS touchée** : elle porte déjà une NetworkPolicy `allow-api-metadata-egress` posée **à la main** il y a 49 jours — aucun label Helm, annotation `kubectl.kubernetes.io/last-applied-configuration` — mais **absente du dépôt**. C'est donc une **dérive de configuration** : la prod marche, une installation neuve / une reprise après sinistre / tout nouvel environnement repart cassé.

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

💻 **Codé (branche `fix/np-metadata-workload-identity`, SHA `6a8e6a8a00`) — NON APPLIQUÉ**

## ✅ Testé live

☐

## Preuve

**Mesuré en réel, pas déduit.** PROD, depuis le pod API : `/computeMetadata/v1/.../email` → **HTTP 200 en 349 ms** (SA `vibecore-prod-platform@…`) ; jeton → **200, expire dans 3581 s** ; `storage.googleapis.com` list buckets → **HTTP 200 en 257 ms, 5 buckets**. ENV D'AUDIT, même appel → **TIMEOUT à 10 s**, et `allow-api-metadata-egress` y est **absente**. Correctif : déclarer la règle dans le chart. Rendu Helm **byte-identique** à la règle qui tourne déjà en prod (diff de spec : aucun écart) → **ne relâche rien en prod**, rend l'état reproductible. Portée étroite vérifiée sur le rendu : **1 seule** règle autorise le metadata (pods `app.kubernetes.io/name=api` uniquement, ports 80 et 988), et l'`except` « 443 vers 0.0.0.0/0 EXCEPT 169.254.169.254/32 » reste en place pour **tous** les pods. Défense en profondeur applicative déjà présente : `rejectInternalGitRemote` (`services/api/src/app.ts`) et le contrôle d'URL de `mcp-marketplace.ts` rejettent loopback/link-local/privé/CGNAT/ULA **y compris** les encodages IPv4-mapped IPv6 et 6to4. ⚠️ **NON APPLIQUÉ** — sécurité réseau de prod → revue expert ; dossier complet : [`docs/audit/BUG-STORAGE-002-REVUE-EXPERT.md`](docs/audit/BUG-STORAGE-002-REVUE-EXPERT.md). Et piège opérationnel : l'objet existant n'appartient pas à Helm, un `helm upgrade` échouerait sur « invalid ownership metadata » et `--atomic` rollbackerait ; l'adoption préalable (`label managed-by=Helm` + annotations `meta.helm.sh/*`) est documentée dans le template.

