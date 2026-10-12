# A-35 — adresses de connexion validées et réserves de preuve

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

## Connexions du navigateur figées (23:53 UTC)

Le navigateur utilise désormais un proxy HTTP local. Chaque requête HTTP et
chaque tunnel CONNECT est résolu et contrôlé par le détecteur partagé, puis
connecté directement à l’adresse validée. Le proxy conserve Host et transmet
les tunnels sans terminer TLS. Aucun second lookup ni proxy de secours.
QUIC et les sorties WebRTC UDP non proxifiées sont désactivés ; les service
workers restent bloqués. Les requêtes vers le proxy interne d’aperçu passent
par un client HTTP dédié, sans suivre les redirections, pour préserver le rendu
interne et son Host. Une erreur ferme la connexion.

La preuve Chromium réelle charge le document d’aperçu, son image locale, une
image externe publique et une WebSocket publique. Un DNS système de fixture
renvoie pourtant une adresse privée pour cet hôte ; aucune seconde résolution
ne se produit. Le serveur privé joignable reçoit zéro requête et zéro nouvelle
connexion TCP. Les images privées, redirections privées et WebSockets privées
sont refusées. Un second test TCP exerce HTTP et CONNECT directement. Un test
sur sockets locales vérifie le refus HTTP/CONNECT en CI sans prérequis Docker.

Quatre contre-épreuves séparées retirent uniquement l’adresse figée de HTTP ou
de CONNECT : deux dans le client de preuve, deux dans Chromium. Chacune rend
un cas rouge et une requête privée réelle (la WebSocket Chromium produit aussi
une connexion TCP privée). Les garde-fous sont ensuite restaurés : les 22 cas
du captureur passent. Types du service, construction et lint passent, avec
deux avertissements antérieurs de fonctions vides. Le total tenu est de 82
cas (41 sécurité/index, 19 API, 22 captureur), dont quatre cas physiques opt-in
et un refus sur sockets réelles exécuté sans option.

Les réserves DNS des sections précédentes décrivent les étapes antérieures ;
la séparation entre validation et connexion est fermée pour les transports
HTTP, Git, HTTP navigateur et CONNECT examinés ici. A-35 n’est pas déclaré
servi : aucun déploiement de ce complément, aucune preuve TLS en production,
aucune preuve d’isolation de tous les protocoles navigateur par une politique
réseau du cluster. Les protections réseau natives sont désactivées uniquement
dans la fixture pour ne pas masquer un défaut applicatif.

## Preuve du captureur exécuté lors de la livraison

Le workflow attendait déjà le rollout conditionnel du captureur, mais le
marquait rolled=false et ignorait son imageID. La matrice le marque désormais
rollé ; une entrée absente et non reconstruite reste omise, alors qu’un
captureur déployé doit fournir son imageID comme les autres Deployments.
Le détecteur existant inclut maintenant les attentes littérales conditionnelles
dans sa comparaison et exige l’archivage des seuls imageIDs vérifiés dans
sbom/running-imageids.json. Aucun secret ni objet Kubernetes brut ajouté.

Les 51 tests manifeste/branchements passent. Retirer seulement le statut rollé
du captureur, ou seulement l’archivage, rend le détecteur réel rouge ; les
protections restaurées rendent les 51 cas verts. Lint différentiel : aucune
nouvelle erreur (dette de ces scripts antérieure à main maintenue). Le chart
porte déjà une restriction d’egress du captureur : sa présence dans le dépôt
ne prouve pas son efficacité dans le cluster ni l’absence de politiques
externes additives. Cette réserve live reste ouverte.

## Intégration à main b7a8b4b3 — 12 octobre

Fusion réelle du lot #716, sans conflit. Après cette intégration : 110 cas
sécurité/manifeste/index/i18n/code mort et 3 cas métriques passent ; les 19
cas API passent, dont le clone Git réel. Les 22 cas du captureur sont tenus
à l’étape précédente, ses fichiers n’ont pas été modifiés par la fusion.
Total distinct : 154 cas. Types web et API passent. Lint web complet : zéro
erreur, 48 avertissements antérieurs. Lint différentiel des fichiers touchés :
aucune nouvelle erreur ; le seul avertissement ajouté dans cette mesure est
une directive d’import NodeNext rendue inutilisée par son override de services.
Les quatre contre-épreuves physiques navigateur/proxy et les deux contre-épreuves
du détecteur de livraison restent documentées ci-dessus.

## Premier verdict CI et diagnostic i18n

Production CI au SHA 0b21e764 échoue avant les tests : le scanner classe huit
diagnostics internes de transport et un corps JSON de fixture comme nouvelle
dette. Les appelants ont été relus : SIEM intercepte l’exception sans sérialiser
son message ; le captureur rend sa réponse générique et ne transmet pas
l’exception. Trois exceptions précises, documentées, attribuées et expirant
le 12 janvier 2027 couvrent uniquement ces fichiers et textes. Le registre
de baseline reste intact. i18n:check passe ; 14 tests du scanner passent.
Retirer les trois exceptions rend le scanner réel rouge ; après restauration
il ne reste que les 21 constats de la baseline existante. La garde du captureur
exige la réponse générique entière, pour exclure l’ajout de diagnostics bruts.
