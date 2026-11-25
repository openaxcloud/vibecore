# Restaurer A, enregistrer B et republier depuis l’IDE

Contrôle Chromium du 25 novembre 2026 sur la PR #937 à `5c80beaecf31dffd0bc16c12a4dd54f403409f46` intégrée localement à `main` à `517e7208dcaf204381178d8c329ba16cf19ed3a7`. Le commit de code testé est `4d25ee82631e01cd967473f065226c880ee0d976`.

## Reproduction sur une pile locale jetable

Utiliser le build web de production, PostgreSQL migré, Redis, l’API, le worker de déploiement, le gestionnaire d’espaces et un agent dont le répertoire de travail est dédié à ce projet. Configurer un cache npm accessible en écriture à l’agent. Au build web, régler `RUNTIME_MODE` et `VITE_RUNTIME_MODE` à `remote-kubernetes`, et les deux variantes de `RUNTIME_API_BASE_URL` à l’origine locale de l’API suivie de `/api/runtime`. Autoriser l’origine locale du web dans `API_CORS_ORIGINS`. La reproduction utilise exclusivement un compte, une organisation et un projet de test. Le gestionnaire délivre des jetons locaux à un agent lancé en processus, avec un enregistrement d’espace de test dans son magasin JSON. Le provisionnement Kubernetes n’est pas couvert par cet essai.

1. Dans le projet vierge, préparer une archive contenant exactement deux fichiers. Mettre `<h1>RESTORED_A_937</h1>` dans `index.html` et le JSON ci-dessous dans `package.json`. Importer l’archive de préparation avec `POST /projects/{id}/files/import/zip`, `zipBase64` et `replaceExisting: true`. Utiliser les mêmes fichiers dans l’espace de test.
2. Créer le point de restauration par `POST /projects/{id}/snapshots` avec `{"label":"Snapshot A"}`. Remplacer ensuite le contenu de l’index dans le projet et l’espace par `<h1>BEFORE_RESTORE_937</h1>`.
3. Ouvrir le même espace dans deux onglets du même contexte Chromium. Ouvrir **Fichiers** dans le second, puis **Snapshots** dans le premier. Cliquer sur **Restore** dans la carte **Snapshot A**. Vérifier le POST du panneau et lire `index.html` dans le répertoire de l’agent. Ouvrir ensuite le fichier dans le second onglet et attendre que Monaco affiche A.
4. Dans Monaco, sélectionner tout, coller `<h1>SAVED_B_937</h1>` sans retour à la ligne, puis cliquer sur **Save**. Vérifier que le fichier de l’agent contient exactement ces 20 octets.
5. Activer le lien **Publish** de l’IDE. Dans la reproduction à 1440 × 900, le séparateur du panneau agent interceptait le clic au centre de ce lien. Son activation au clavier avec **Entrée** a ouvert le panneau. Cliquer sur **Publish**, développer les options avancées, sélectionner **Static**, garder l’environnement **Preview** et soumettre. Attendre le statut `READY`.
6. Ouvrir l’URL retournée par le déploiement dans un nouveau contexte Chromium sans cookie. Vérifier le statut HTTP, le texte du titre et les octets du corps. Revenir au panneau Déploiements et cliquer sur **Republish**. Refaire les trois contrôles sur l’URL du nouvel enregistrement et vérifier l’identité de l’espace source.

```json
{"name":"proof937","version":"1.0.0","scripts":{"build":"mkdir -p dist && cp index.html dist/index.html"}}
```

## Résultats observés

La restauration a répondu HTTP 200. L’agent et le second onglet ont montré A. Après sauvegarde, le fichier de l’agent contenait B.

| Opération | Identifiant de déploiement | État | Réponse et rendu sans session |
| --- | --- | --- | --- |
| Publication | `cmww7negb006hc2olzc0y6kra` | READY | HTTP 200, titre SAVED_B_937 |
| Republication | `cmww7nhqo0070c2ols0hszlz9` | READY | HTTP 200, titre SAVED_B_937 |

Les deux enregistrements portent l’espace `cmww7n5li004nc2olx3ukspr9`. Les URL sous `http://127.0.0.1:3937/static-deployments/{id}/` ont renvoyé exactement le contenu de B. SHA-256 des deux réponses : `829bb1b381d04ed0aed977e8de7c4fbe2ffff3aec5e2d0bbbb4d676aee9ae8f1`.

Les dix suites Vitest modifiées côté application ont réussi (151 tests), ainsi que les cinq suites API ciblées (23 tests). Le build React Router client et serveur a réussi.
