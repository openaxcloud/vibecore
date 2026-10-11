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

## Connexions HTTP et Git reliées aux adresses validées

Le transport SIEM utilise HTTP(S) natif : la résolution contrôlée fournit les adresses au lookup du socket, sans seconde résolution ni proxy de secours. Le hostname original conserve Host et la vérification TLS native ; les redirections ne sont pas suivies. Réponse bornée et délai d’arrêt sont conservés, avec reçus SIEM limités à 64 Kio. Les URL avec identifiants restent refusées pour HTTP, comme par fetch auparavant. Git conserve son URL authentifiée éventuelle, passe les adresses validées à http.curloptResolve, refuse les redirections, désactive le proxy, impose la vérification TLS et ignore les réécritures de configuration globale/système.

Preuves physiques dans le conteneur de test possédé : réseau Docker interne 93.184.216.0/24, serveur public 93.184.216.34 et serveur privé en boucle locale. Un appel direct atteint d’abord le serveur privé, puis ses compteurs sont remis à zéro. HTTP transmet le POST, son corps et son entête de fixture au serveur public, sans requête privée ni lookup système secondaire. Git 2.39.5 clone réellement un dépôt par smart-HTTP malgré une entrée hosts privée, puis refuse une redirection privée. Aucun hôte externe ni donnée client visés ; les signatures sont des fixtures.

Contre-épreuves TCP : enlever seulement le lookup imposé à HTTP rend une requête privée ; enlever seulement curloptResolve de Git en rend deux ; autoriser seulement les redirections Git en rend une. Chaque preuve devient rouge. Sources restaurées : 80 cas dans quatorze suites passent (41 sécurité/index, 19 API, 20 captureur), dont trois cas physiques HTTP/Git/Chromium. Ces derniers nécessitent OUTBOUND_PROOF_CONTAINER et le Chromium installé ; sans prérequis ils sont explicitement ignorés, jamais présentés comme mesurés par une CI qui ne les joue pas. Types web/API/sécurité et constructions web/API réussis. Lint différentiel : aucune nouvelle erreur, dette historique conservée.

Réserve maintenue : le navigateur poursuit certaines requêtes externes après un contrôle DNS préalable ; ces connexions et enchaînements de redirections ne sont pas reliés à la résolution validée. Les trois contre-épreuves du captureur empêchent de prendre ses politiques réseau natives pour une preuve de notre garde. A-35 reste partiel. Les connexions physiques mesurées ici sont HTTP, pas une preuve de négociation TLS en production. Aucun contrôle ni attaque de production effectué.
