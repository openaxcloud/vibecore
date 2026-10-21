---
id: BUG-DEPENDENCY-CRITICAL-20261021
---

# Dépendances critiques Capacitor et Tinypool

📤 Dispatché : pris en charge le 21 octobre 2026.

💻 Codé : candidat sur branche isolée, non fusionné et non livré.

✅ Testé live : non. Aucune exploitation de production, recette appareil ou
redistribution native attestée.

Sur main `6eb4bf42951057a6aa98e195a05e97211744964f`, l'audit signale quatre
critiques : deux paquets natifs Capacitor 8.3.1 pour un même avis, deux avis
Tinypool 1.1.1 utilisé par Vitest. Le vert consultatif ne certifie pas leur
absence. Les préconditions d'exploitation doivent être distinguées des versions
affectées.

[Triage, sources, limites et corrections proposées](../reprise/security-2026-10-21/TRIAGE.md).
