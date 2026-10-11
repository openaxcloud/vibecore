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

## Complément navigateur mesuré vers 22:00 UTC

Le routage contrôle maintenant les documents et sous-ressources HTTP externes, même lorsque le proxy d’aperçu n’est pas configuré. Une erreur de routage ferme la requête au lieu de rétablir le passage. Les service workers sont désactivés pour éviter leur contournement de l’interception.

Un test Chromium réel a révélé que `route.continue` ne conservait pas le Host attendu sur le proxy. Le proxy utilise maintenant `route.fetch` puis `route.fulfill`, en gardant le Host, sans suivi implicite de redirections ; la première destination de redirection est contrôlée avant transmission. Le corps de réponse est libéré après transmission. La navigation conserve son protocole original.

20 tests dans quatre suites passent, dont le témoin Chromium/TCP opt-in. Ce témoin charge effectivement le document et l’image de l’aperçu ; un second serveur HTTP privé reçoit zéro requête. Un appel témoin confirme que ce serveur est joignable. La fixture désactive les protections réseau propres à Chromium pour que celles-ci ne puissent pas masquer un défaut de notre garde ; ces options ne sont jamais appliquées au renderer de production. Retirer séparément l’admission privée, le contrôle de la première redirection ou l’interdiction du suivi implicite produit à chaque fois une requête privée réelle et rend le test rouge. Toutes les protections sont restaurées, les 20 tests rejoués. La capture montre effectivement le titre et l’image verte, et les images interdites échouent.

Types complets du service, y compris ses fixtures, et construction réussis. Le tsconfig local manquant est ajouté ; le script de types le lit. Le lint ne conserve que deux avertissements antérieurs de fonctions vides. Aucun navigateur n’est lancé dans les suites backend ordinaires sans option explicite.

Ce complément reste préparé, pas servi. Il ne clôt pas A-35 : le socket de connexion n’est toujours pas fixé à l’adresse validée ; les ressources externes hors proxy, les chaînes de redirections et les protocoles autres que HTTP demandent encore une protection complète. Aucun scénario d’attaque en production n’est revendiqué.
