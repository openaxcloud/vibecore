# Rejouer l’import Git et le Push depuis l’IDE

Depuis la racine du dépôt avec les dépendances installées, lancer `scripts/qa/git-import-push/replay.sh`. Ce scénario Linux utilise Python 3, Git et Chromium. La variable `CHROMIUM_PATH` permet de sélectionner l’exécutable du navigateur. Les ports locaux par défaut sont 19317 pour l’API et 19587 pour le serveur web.

Le script crée un compte synthétique et un dépôt bare de trois commits. Chromium soumet le formulaire d’import. Le contrôle vérifie la branche, le SHA importé, son ascendance et l’origine configurée dans le projet. Une archive envoyée par l’API locale fournit le fichier à indexer. Chromium clique sur **Tout indexer**, **Committer les modifications** puis **Push**. Le contrôle relit le contenu du commit, son parent et la référence dans le dépôt bare.

Le double remplace uniquement le transport vers la forge synthétique. Pour le Push, il exige que le projet ait conservé exactement l’origine soumise dans le formulaire. Le stockage de fichiers, Git, les routes d’import et de mutation, et le panneau IDE suivent leur chemin normal. Les données de compte restent en mémoire. Les répertoires du scénario sont temporaires.

## Capacité et persistance

Une instance API admet un import Git à la fois, jusqu’à la publication du projet et au nettoyage. Une demande concurrente reçoit HTTP 503 et `Retry-After`. Les commandes Git se partagent un budget de 120 secondes. Le groupe de processus dispose ensuite d’une seconde pour s’arrêter. Les appels au stockage et à la base de données peuvent prolonger la réponse HTTP.

| Ressource | Borne pour un import depuis le formulaire |
| --- | --- |
| Transport HTTPS | 64 Mio de données de tunnel cumulées, dans les deux sens et sur toutes les connexions. Git vérifie le certificat du nom d’origine et le tunnel utilise les adresses déjà autorisées. |
| Fichiers de travail | 5 000 entrées, 25 Mio par objet de l’arbre courant, 32 Mio au total. L’API lit les blobs après vérification de l’arbre, sans extraire de copie de travail temporaire. |
| Historique | 96 Mio d’objets et d’index transférables, 8 192 entrées examinées. Chaque fichier est déplacé ou copié puis libéré si les volumes sont distincts. |
| Processus Git | 64 Mio par fichier créé et 512 Mio d’espace d’adressage par processus. |
| Volumes | Le chart réserve un tmpfs de 128 Mio par pod API pour le clone temporaire. Le projet reçoit ses objets sur le volume de projets. L’API exige 256 Mio disponibles avant de commencer. |

En production, un montage temporaire absent ou sans plafond compatible fait échouer l’import avec `503 IMPORT_STORAGE_UNAVAILABLE`. Le budget du transfert concerne la charge du tunnel. Les en-têtes IP/TCP et les retransmissions du système échappent à ce compteur. Le contrôle d’espace disponible sur le volume partagé est une mesure à l’admission. D’autres répliques peuvent écrire en parallèle.

Les valeurs Helm de production déclarent Filestore CSI en ReadWriteMany pour `/data/vibecore/projects`. Le panneau Git HTTPS utilise le dépôt de l’API. Le ZIP de synchronisation du workspace transporte les fichiers de travail, et le dépôt reste sur le volume de l’API. Le scénario local effectue une synchronisation ZIP avec remplacement, recharge l’IDE, puis vérifie le commit et le Push. Un test séparé rouvre le stockage après restauration d’un instantané. La validation du PVC monté, d’un redémarrage de pod et d’une lecture depuis une seconde réplique exige un environnement Kubernetes.

Le scénario arrête complètement le premier processus API après la sauvegarde ZIP, supprime son répertoire de clone temporaire et démarre un second processus sur le même port et le même répertoire de projets. Le parent conserve en mémoire les lignes synthétiques qui représentent la base applicative. Le navigateur conserve sa session et rouvre la même URL. Le test exige une réponse 401 sans session, retrouve le même identifiant de projet avec la session, vérifie HEAD et origin, puis compare le SHA poussé à la référence du dépôt bare jetable. Ce scénario exerce le contrat du répertoire partagé sur une machine Linux. Le rattachement d’un PVC après remplacement d’un pod reste à éprouver sur un banc Kubernetes autorisé.
