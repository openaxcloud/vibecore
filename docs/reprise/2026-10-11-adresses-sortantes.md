# A-35 — garde d'adresses sortantes, réserve DNS maintenue

Reprise par fusion réelle de `sec/audx-006-ssrf-dns-rebinding` sur `4f7c07f7`. Les deux conflits ont été résolus en conservant tous les messages de main et Playwright 1.63 de main ; ajout de la dépendance security du captureur. Installation hors ligne avec verrouillage figé réussie.

La garde refuse les destinations privées écrites ou résolues, les résolutions en échec et les listes autorisées vides. Le captureur et la livraison SIEM recontrôlent la destination ; les imports Git refusent les protocoles interdits et les adresses privées littérales. Les IPv6 mappées hexadécimales, IPv6 développées et multicast sont également refusées.

## Mesures locales du 11 octobre

- Security : 26 tests, dont six contre-exemples IPv6 rouges avant le complément et verts après.
- Captureur : 7 tests passent ; typecheck ciblé passe.
- Imports Git et livraison SIEM : 9 tests passent. Correction de la fixture chiffrée SIEM : elle utilise maintenant la même clé par défaut que le déchiffreur. Le témoin positif vérifie la résolution et l'envoi réel via fetch ; les refus ne proviennent plus d'un déchiffrement impossible.

- Typecheck complet du monorepo : passe. Builds API et captureur : passent. Lint ciblé : zéro erreur (règle des alias applicatifs désactivée pour les imports relatifs NodeNext des services).
- Contre-épreuve SIEM : désactivation de la garde de destination uniquement → trois refus deviennent rouges, le témoin public reste vert. Garde restaurée exactement après mesure.

## Réserve bloquante pour clore A-35

La résolution de contrôle et la connexion du transport restent distinctes. Une modification DNS entre les deux n'est pas empêchée. Les imports Git sur un nom de domaine ne sont pas protégés contre cette réassociation. Il faut fixer l'adresse utilisée par le transport ou imposer une barrière réseau avant de déclarer ce point réparé intégralement. Aucun scénario d'attaque n'a été mesuré en production.
