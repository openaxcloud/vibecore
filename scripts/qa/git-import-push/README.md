# Rejouer l’import Git et le Push depuis l’IDE

Depuis la racine du dépôt avec les dépendances installées, lancer `scripts/qa/git-import-push/replay.sh`. Ce scénario Linux utilise Python 3, Git et Chromium. La variable `CHROMIUM_PATH` permet de sélectionner l’exécutable du navigateur. Les ports locaux par défaut sont 19317 pour l’API et 19587 pour le serveur web.

Le script crée un compte synthétique et un dépôt bare de trois commits. Chromium soumet le formulaire d’import. Le contrôle vérifie la branche, le SHA importé, son ascendance et l’origine configurée dans le projet. Une archive envoyée par l’API locale fournit le fichier à indexer. Chromium clique sur **Tout indexer**, **Committer les modifications** puis **Push**. Le contrôle relit le contenu du commit, son parent et la référence dans le dépôt bare.

Le double remplace uniquement le transport vers la forge synthétique. Pour le Push, il exige que le projet ait conservé exactement l’origine soumise dans le formulaire. Le stockage de fichiers, Git, les routes d’import et de mutation, et le panneau IDE suivent leur chemin normal. Les données de compte restent en mémoire. Les répertoires du scénario sont temporaires.
