---
id: BUG-SEC-SCREENSHOTTER-EGRESS-001
---

## Bug

**P1 — la politique réseau du screenshotter était neutralisée par trois autorisations générales.** Les NetworkPolicies se cumulent : `allow-platform-required-egress` ouvrait HTTPS y compris les adresses privées, `allow-intra-namespace-platform` ouvrait tous les ports entre pods, et `allow-database-redis-egress-managed` ouvrait PostgreSQL/Redis. L’allowlist du renderer valide uniquement l’URL initiale ; les ressources/redirects d’une page peuvent déclencher d’autres accès.

## 📤 Dispatché

📤 Pris en charge le 07/10/2026.

## 💻 Codé

☐ Fusion en attente. Les trois autorisations générales excluent screenshotter de leur egress. L’ingress partagé est conservé dans sa politique existante ; l’egress intra-namespace devient une politique distincte. La politique dédiée autorise DNS kube-system, HTTPS public avec exclusions IPv4 privées/spéciales, et uniquement le port du preview-proxy pour les pods de plateforme.

## ✅ Testé live

☐ Non confirmé. Le rendu du graphe ne prouve pas l’application des politiques par le CNI. Il faut inspecter TOUTES les politiques live, y compris l’ancienne `allow-database-redis-egress` non gérée par Helm : une autorisation supplémentaire peut rouvrir le trafic. Exiger ensuite des tests réseau depuis un vrai pod screenshotter et un aperçu réellement capturé. Aucun accès cluster utilisable dans cette session.

## Validation

`infra/scripts/validate-screenshotter-network.mjs` évalue l’union des politiques rendues et 14 flux positifs/négatifs : HTTPS public, DNS TCP/UDP, preview-proxy, refus API, DB, Redis, métadonnées, RFC1918 et CGNAT. Appelé par `infra/scripts/validate.mjs` sur les valeurs par défaut avec screenshotter activé et sur les valeurs production. Contre-épreuve ancien template : refus attendu API 10.1.0.3:3001 devient autorisé et le validateur échoue ; template corrigé : 14 contrôles passent dans les deux rendus. Cette garde vérifie le graphe IPv4 du chart, pas les politiques extérieures ni un cluster live.
