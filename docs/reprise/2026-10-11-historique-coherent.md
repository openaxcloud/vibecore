# A-11, A-12 et A-14 — persistance et chargement du fil

Fusions réelles depuis la branche validée des envois d'onglets, sur main `4f7c07f7`, de `fix/ide-memory-read-retry` puis `recup/chargement-echoue-pas-conversation-neuve`. Aucun conflit. Les envois par domaine et la suppression du double PUT restent présents.

La lecture de mémoire réessaie les coupures et les erreurs serveur avec des délais bornés, conserve le repli local immédiat et présente un bouton de reprise lorsque les tentatives échouent. La récupération de transcription présente également son échec durablement. Les deux états empêchent ensemble l'écran mobile de démarrage de faire passer l'échec pour un projet neuf.

## Mesures locales du 11 octobre

- 49 assertions passent dans six suites : mémoire, envois d'onglets, état d'échec, session, copie serveur au retour et messages rechargés.
- Suppression de la relance seulement : l'assertion de lecture avortée échoue, sans rejet de promesse non observé.
- Suppression de la garde des messages rechargés : deux assertions rouges, deux témoins verts.
- La garde de sauvegarde attend désormais un témoin dans la même file réelle au lieu d'attendre arbitrairement 50 ms. Sous charge, l'ancien délai attribuait un envoi au scénario suivant.
- Typecheck web : passe ; lint ciblé corrigé sans erreur ; build React Router : passe, heap Node 8 Go.
- Playwright découvre 18 scénarios avec les deux projets de la configuration, dont les trois cas de mémoire inaccessible aux largeurs 390, 768 et 1440. La découverte n'est pas une exécution.

Aucune pile E2E locale complète n'a été montée. Les scénarios navigateur et le parcours dans un compte de production restent à exécuter ; cette branche n'est pas fusionnée ni servie.
