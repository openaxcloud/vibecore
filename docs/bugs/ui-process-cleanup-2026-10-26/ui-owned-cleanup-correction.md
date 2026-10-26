# Correction du constat de fermeture des serveurs UI

Les anciens reçus cleanup.json constataient SIGTERM et refus de connexion111. Cela prouvait la fermeture du port, **pas la terminaison du processus**. Les affirmations « serveurs arrêtés » des recettes Entry12399, Zoom13599 et SafeContent11299/11399 étaient donc trop fortes. Les archives et têtes publiées ne sont pas réécrites ; cette correction conserve le constat antérieur.

Vérification ultérieure : PID177333/start2532223,188380/start2719948,158383/start1935728,159444/start1967103 étaient encore en étatS avec leurs commandes ReactRouter et leurs origines concordantes. Lecture cwd refusée, sans escalade ; PID/startTicks/cmdline et fichiers de provenance ont été utilisés. Aucun processus à identité incertaine ciblé.

Chacun a reçu un nouveau SIGTERM après vérification. Après3secondes, tous sont en étatZ, cmdline vide, aucune VmRSS : processus terminés mais non encore récoltés par leur parent. **Aucun SIGKILL nécessaire**, aucun signal adressé aux zombies. Ports11299/11399/12399/13599 refusent toujours la connexion111. Les API6499/6799 étaient déjàZ avant ce nettoyage et n’ont reçu aucun signal.

Somme RSS avant des quatre processus :1155228KiB (~1.10GiB). Ce total RSS n’est pas une mesure exacte de mémoire cgroup libérée (pages partagées et activité concurrente). Mesure cgroup après dans ui-owned-cleanup-cgroup-after.json ; pas d’attribution causale de l’ensemble de la variation à ce nettoyage.

Preuves : /tmp/ui-owned-cleanup-review.json (constat initial), /tmp/ui-owned-process-cleanup.json (identités, états avant/après, signaux, ports), /tmp/ui-owned-process-cleanup.py (script exact). Support11499/11599 appartient à public_ui_audit : non touché.5499/9399 exclus et non touchés. Aucun navigateur/build/code/index/commit lancé ou modifié. Le commit priority et la tête #800 restent inchangés.
