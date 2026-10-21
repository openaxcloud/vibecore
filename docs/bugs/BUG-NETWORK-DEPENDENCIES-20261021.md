---
id: BUG-NETWORK-DEPENDENCIES-20261021
---

# Dépendances réseau : fragments WebSocket et abandon de compression

## 📤 Dispatché

Triage des high production demandé le 21 octobre 2026 ; base main 883af053.

## 💻 Codé

Branche isolée : ws résolu en 8.22.0 (minimum corrigé 8.21.0), compression 1.8.2. Aucun seuil de scan, délai ou contrôle d'accès modifié. Pas encore fusionné ni livré.

## ✅ Testé live

Reproductions locales loopback avec vrais sockets et flux zlib : ancien ws accepte 16 385 fragments de 1 octet, nouveau refuse ; anciens flux gzip/deflate/br ne libèrent pas leur handle après abandon client, nouveaux oui. Réponses normales préservées. Aucun essai production ni épuisement mémoire. Preuves et limites dans docs/reprise/network-dependencies-2026-10-21/README.md.
