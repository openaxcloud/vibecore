# Parcours client intégrés — 11 octobre 2026

Ce lot réunit A-13/A-19 (session et inscription), A-15 (nouvelle tentative Vercel), A-20 (instantané interdit au lecteur), A-21/A-22 (suppression décrite honnêtement et avertissement conditionnel), A-23/A-24 (messages compréhensibles), A-27 (routes publiques canoniques), A-29/A-30/A-31/A-33/A-34 (lisibilité). Il conserve #711, #712 et le lot IDE #714. Les branches de préparation correspondantes sont remplacées par ce lot ; elles ne doivent pas être livrées séparément.

Les fusions réelles n’ont rencontré que des conflits d’index dérivé, résolus par régénération. Les états de chargement IDE, la reprise du tour et les gardes de fichiers sont conservés. A-32 garde le composant actuel de main : sa branche ancienne aurait réintroduit la feuille et les modes retirés ; la taille réelle au toucher reste à mesurer.

Vérifications locales : 117 tests dans 17 suites application/facturation/index, 129 tests dans neuf suites API, et 77 tests dans neuf suites de voisinage IDE. Les totaux de suites répétées ne sont pas additionnés deux fois. Les cas API incluent les libellés de portefeuille de #711 et la réparation de panneau de #714. Types web/API/facturation et leurs constructions réussis. Le lint web complet de CI passe avec zéro erreur et 48 avertissements préexistants ; le lint différentiel API ne rapporte aucune nouvelle erreur. Un avertissement de directive inutilisée apparaît seulement lorsque la règle d’import NodeNext est exclue pour la comparaison ; la directive reste nécessaire avec le lint sans exclusion.

La reprise a trouvé un défaut supplémentaire : le composant Vercel journalisait l’objet de connexion complet, jeton compris. Le journal brut est supprimé. Un cas observe les vrais appels à la console avec une fixture, exige un témoin positif et refuse toute présence de cette fixture ; le retour du seul journal brut rend ce cas rouge, puis les cinq cas Vercel sont verts après restauration. Aucun jeton client réel n’a été lu ni imprimé. La fiche source est BUG-QA1011-VERCEL-JETON-DANS-CONSOLE.

Les contre-épreuves propres à chaque mécanisme sont conservées dans les documents de préparation : session, fournisseurs configurés, verrou Vercel, demande de purge, envoi conditionnel de l’avertissement, vocabulaire, détecteur de contraste et défilement. Les valeurs d’encre ne sont pas épinglées indépendamment du ratio.

État : préparation intégrée, pas sur main et pas servie. Les contrôles GitHub et les scénarios navigateur restent requis avant fusion ; les parcours authentifiés et mesures dans les trois formats/thèmes restent à établir en production. Ce lot n’active pas la purge physique A-6 et ne crée aucun prix Stripe A-2.

Après fusion réelle de main 83d1c63e (#714), aucun contenu source du lot n’a changé. La correction de cible tactile à 44 px est conservée ; 51 tests dans cinq suites (détecteur tactile, libellés, contrastes, thèmes et index) passent. Construction web finale réussie et lint web complet : zéro erreur, 48 avertissements préexistants.

CI complète du premier passage : 9 522 cas verts, deux ignorés, un rouge sur l’empreinte du bloc mobile. La procédure du test autorise un re-scellement après comparaison nommée : seules deux insertions de A-34 diffèrent de main, le hook de défilement et son ref DOM. Zéro ligne supprimée ; libellés, classes, en-tête et Terminal inchangés. L’empreinte est mise à jour après cette lecture ; le détecteur E2E de visibilité reste inchangé. Mesure : mesures/2026-10-11-a34-bloc-mobile.json. Ce re-scellement ne vaut pas mesure du parcours mobile en production.

Après re-scellement : 29 cas dans quatre suites passent. Ajouter seulement une classe imprévue à la bande mobile rend la garde d’empreinte rouge ; balisage restauré, les 29 cas repassent. Lint du test vert. Aucun assouplissement du détecteur de visibilité ni du scanner français.

### Contrat OAuth navigateur après A-19 (23:50 UTC)

Le passage E2E du SHA d12d556f échoue sur deux anciennes assertions qui
exigeaient des boutons non configurés. Le test lit maintenant la disponibilité
des deux fournisseurs dans la même API que le loader, exige une réponse valide
et vérifie le nombre et les destinations des seuls boutons disponibles.
Le vrai loader et le vrai écran sont aussi exercés pour trois configurations,
avec et sans destination : 6 cas verts, dont des fournisseurs disponibles.
Retirer uniquement la destination du composant partagé rend 2 cas rouges ;
restauration : les 16 cas des trois suites OAuth sont verts. Aucun fournisseur
de production ni secret OAuth n’a été ajouté pour satisfaire un test.
