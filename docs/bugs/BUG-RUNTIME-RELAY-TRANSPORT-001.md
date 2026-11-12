---
id: BUG-RUNTIME-RELAY-TRANSPORT-001
---

# BUG-RUNTIME-RELAY-TRANSPORT-001 — Transport CI représenté par HTTP 502

## État

- Fusion dans main : non validée.
- Déploiement : non validé.
- Recette runtime réelle : non validée.

## Constat

**Les erreurs de transport du relais CI échappent à la récupération des lectures.**

Le runtime 43097804276 conserve six réponses 502 sur les lectures fichiers pendant les remplacements de pods. Le relais
CI convertit une connexion refusée au pod en réponse HTTP 502. Le fetch de l'API ne lève donc pas d'exception :
la récupération limitée aux erreurs de transport ne s'exécute pas. Ce contrat est reproduit avec le vrai relais
et la branche API extraite ; les corps des six réponses du run ne sont pas conservés.

## Correction proposée

Le relais marque uniquement ses propres erreurs de transport et retire ce marqueur des requêtes clientes et
des réponses réelles de l'agent, y compris les handshakes WebSocket. L'API le reconnaît seulement avec l'opt-in CI,
sur l'origine loopback configurée, pour une réponse 502 sans redirection, y compris celles qui reviendraient
à la même URL. Après les retries existants, seul GET/HEAD peut rejoindre l'attente bornée existante : STARTING confirmé par le manager, puis RUNNING et sonde interne réussie, puis une lecture avec token
frais. La sonde prouve la joignabilité, pas l'authentification ; la lecture réelle vérifie le token.

Deadline absolue et annulation sont conservées. Aucun provisioning ou replay d'écriture supplémentaire, ni retry
généralisé des 502. Les vrais 404 et la politique existante des HTTP 502/503/504 métier restent inchangés. Les
conflits 412, le timeout Packages, les credentials IA et la recette GCS active restent distincts.

## Vérification

59 tests locaux passent après revue indépendante, dont le vrai relais HTTP et la branche API, GET et HEAD,
rejet des marqueurs usurpés HTTP/WebSocket, erreurs métier, absence d'opt-in, écritures, STARTING absent,
deadline et annulation. La revue ajoute le rejet explicite de toute redirection, même vers l'URL initiale,
et préserve STREAM_ABORTED si l'annulation survient juste après réception de la réponse du relais.
Le relais original échoue au nouveau cas positif ; le candidat initial échoue aux contre-épreuves de la revue.
Les huit contrats locaux existants manager/token passent également. Ce n'est pas une preuve Kubernetes/live ;
nouveau runtime requis.

## 📤 Dispatché

Proposition locale sur le produit de 9e8e4db, inchangé par la correction trace da4bab7.

## 💻 Codé

Patch local seulement, non publié.

## ✅ Testé live

Non validé.
