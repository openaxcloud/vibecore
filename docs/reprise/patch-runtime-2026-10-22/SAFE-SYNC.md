# Synchronisation additive : dépendances et garanties

Ce document décrit une voie bornée ; aucune opération n'a été exécutée sur le projet utilisateur par ce lot.

`Run app` / `Retry run` n'est pas une restauration explicite du manifeste de sources. L'action de rafraîchissement avec `reparer=1` peut réconcilier le stockage projet avant la copie runtime et n'offre pas les garanties requises pour une restauration sans écrasement.

Pour un export déjà inspecté, la voie existante `POST /api/runtime/workspaces/:id/files` avec `{path, content}` utilise la création exclusive du workspace-agent (`wx`). Un chemin déjà présent est refusé. Elle tente aussi de mettre à jour le manifeste persistant : ce n'est pas une lecture seule. La route intercepte cependant l'échec de persistance puis renvoie quand même 204. Ce résultat ne certifie donc pas l'égalité des deux stockages ; leur relecture indépendante est nécessaire. Aucune interface de copie additive par lot n'a été identifiée.

La primitive existante ne suffit donc pas à la réparation runtime seule demandée. Ne pas utiliser New File puis collage : le contenu intermédiaire peut remplacer la bonne entrée du manifeste. Le glisser-déposer actuel n’est pas sûr non plus : Uint8Array est encodé en base64 sans transmettre cet encodage à writeFile.

Contrat requis pour une route dédiée, à coordonner avec le chantier API : lire uniquement le contenu persisté, comparer le fichier runtime, laisser un contenu identique intact, refuser un contenu différent, créer exclusivement un absent, puis relire. Ne pas appeler persistProjectFileEntry ni une restauration globale. L’accès doit conserver l’autorisation workspaces:write et le rattachement au projet. Une collision entre lecture et création doit être relue et classifiée, jamais écrasée.

Critères de recette pour cette voie dédiée :

1. Geler les écritures concurrentes et comparer les chemins et SHA256 de l'export et du runtime. Exclure secrets, dépendances et chemins hors projet.
2. Sauvegarder les fichiers inspectés et relire l'archive. Conserver les fichiers runtime supplémentaires, notamment le verrou de dépendances.
3. Créer exclusivement les fichiers absents. Ne pas employer `/files/write`, une restauration globale ou une importation ZIP pour ce rattrapage.
4. Relire chaque fichier créé et comparer son SHA256 à la source. En cas de collision ou de résultat incertain, arrêter et lire avant toute répétition. Ne pas écraser un fichier apparu entre comparaison et création.
5. Vérifier les imports et dépendances avant de démarrer. Un export incomplet ne peut pas fournir les composants qui n'y existent pas.

Une synchronisation générale sûre des fichiers existants nécessiterait une comparaison atomique de version/contenu côté serveur, avec sauvegarde et résultat vérifiable. Ces modifications appartiennent au chantier API ; elles ne sont pas incluses ici. Le mécanisme automatique de récupération d'un fichier absent reste exclu, car un contenu original vide ne prouve pas sa création plutôt que sa suppression intentionnelle.

Les observations du navigateur (9 fichiers communs identiques, 20 sources absentes du runtime et sauvegarde relue) sont des éléments rapportés par le chantier navigateur, pas des opérations répétées dans ce lot. Aucun succès de réparation ou de génération de l'application utilisateur n'est revendiqué.
