# B-14 — extinction complète de la pile locale

Fusion réelle de `fix/pile-locale-extinction-complete` sur `4f7c07f7`, sans conflit ; lecture directe de l'écart du fichier avant reprise.

Le filet d'extinction ne tente plus de tuer son propre parent avant de rendre le verrou OrbStack et de supprimer son fichier d'état.

La nouvelle garde Vitest extrait et exécute la fonction réelle du script. Les appels de destruction sont interceptés ; aucun processus réel ni conteneur n'est arrêté. Elle vérifie qu'un processus de travail est visé, que le parent est préservé, que le verrou est restitué, que l'état est effacé et que la fin du nettoyage est atteinte. Témoin : avec le script de main, le test échoue et montre les appels de destruction du parent.

Validation : garde verte, syntaxe Bash valide. Ce banc isolé ne prouve pas l'extinction réelle d'une pile OrbStack sur macOS ; ce scénario reste non mesuré.
