---
id: BUG-RUNTIME-READ-STARTING-001
---

# BUG-RUNTIME-READ-STARTING-001 — Lectures pendant le redémarrage du workspace

## État

Correctif préparé et vérifié localement sur la base `16636768acb8365f4ec64ab6657b10eeaac42e7d`.

- Fusion dans `main` : non validée.
- Déploiement : non validé.
- Recette sur un runtime réel après déploiement : non validée.

## Défaut et preuve

Le runtime CI `43084975201` constate neuf erreurs502 sur les lectures de fichiers pendant des fenêtres de
remplacement du pod, avant son retour à RUNNING. Les changements réels d'environnement peuvent légitimement
imposer ce remplacement. Les courts retries de transport des lectures ne couvrent pas ces fenêtres.

## Correction

Après l'épuisement des retries de transport, une lecture GET/HEAD peut attendre uniquement si le manager
confirme STARTING. La reprise exige ensuite RUNNING et un health check authentifié réussi, puis autorise une
seule nouvelle lecture, sans provisioning supplémentaire ni récupération récursive. Cela inclut également
un premier démarrage confirmé : STARTING ne distingue pas les générations de pods.

L'attente ajoutée, ses sondes et sa lecture partagent une deadline absolue calculée depuis l'entrée dans
agentRequest et son budget existant. Ce n'est pas une nouvelle borne globale sur les anciennes tentatives,
qui conservent leurs timeouts propres. L'annulation du client interrompt l'attente et les opérations réseau.
Une disparition, un échec, une expiration ou une réponse invalide ne devient jamais un succès. Sans preuve
STARTING, la classification et le comportement de démarrage préexistants restent applicables.

La politique existante de retry des GET/HEAD502/503/504 est conservée. Les vrais404 et les écritures ne sont
pas modifiés. Aucun filtre d'erreur HTTP n'est ajouté à la recette.

## Vérification et limites

32 tests locaux couvrent l'attente, la readiness retardée, les erreurs, l'annulation, les deadlines et les
vrais404. Ils exécutent le helper et les branches réelles extraites de l'API avec un serveur HTTP local ;
ils ne constituent pas une recette Kubernetes. Le typecheck strict du helper passe. Les vérifications
complètes du dépôt et une nouvelle exécution du runtime restent nécessaires.

Le health check est ponctuel et ne garantit pas que le pod ne changera plus. Les cinq404 post-redémarrage,
les conflits412 de l'état IDE, le timeout Packages, l'absence de credentials IA et la recette Storage active
sans bucket GCS autorisé restent des sujets distincts, non résolus par ce correctif.

## 📤 Dispatché

Correctif préparé localement pour PR893.

## 💻 Codé

Non fusionné et non déployé ; patch local uniquement.

## ✅ Testé live

Non validé ; tests locaux contrôlés seulement.
