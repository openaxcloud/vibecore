# Règles de méthode conservées

Ajouts historiques de docs/methode-et-architecture ; les instructions de reprise du 11 octobre priment.

## Règles de méthode — à lire avant de corriger quoi que ce soit

Ces huit règles viennent d'erreurs réelles commises le 2026-08-31, chacune
chiffrée dans `docs/audit/FAUX_NEGATIFS_DE_MESURE.md`. Elles ont coûté un revert
inutile, un correctif branché au mauvais endroit et plusieurs heures de fausse
piste.

1. **Mesurer le chemin réel avant de corriger. Jamais le déduire d'une lecture de
   code.** J'ai branché la persistance sur `PUT /files/write` parce que
   `files.ts:881` l'appelle — sans vérifier que `Ctrl+S` y aboutit. Il n'y
   aboutit pas dans le cas normal. Tracer la requête, du navigateur jusqu'à la
   fonction serveur, avant d'écrire une ligne.

2. **Relancer le même commit avant d'accuser un changement.** Trois tests E2E ont
   échoué sur mon commit et pas sur les précédents ; j'ai reverté. La relance du
   MÊME commit, sans rien changer, est passée au vert. Le coût d'une relance est
   dérisoire devant celui d'un revert.

3. **Distinguer « rien trouvé » de « rien exécuté ».** `grep | wc -l` rend `0`
   quand le fichier n'existe pas, quand le motif est faux, et quand il n'y a
   vraiment rien. Toute commande de comptage doit afficher combien d'éléments
   elle a examinés, et refuser de conclure si ce nombre est nul ou inattendu.

4. **Vérifier qu'une mesure a porté sur quelque chose.** Une sonde doit échouer
   bruyamment quand elle n'a pas pu mesurer, jamais rendre « 0 défaut ». Un champ
   d'erreur qu'il faut penser à lire n'est pas une protection. Avant de lire un
   résultat : la page a-t-elle chargé ? la frappe est-elle arrivée ? le corps
   est-il tronqué ? le thème mesuré est-il celui qu'on croit ?

5. **Ancrer les tests sur du code, jamais sur des commentaires.** Six tests écrits
   dans la journée ont été cassés par leur propre prose, qui citait le motif
   interdit. Retirer les commentaires avant de scanner, et viser la déclaration.

6. **Contre-épreuve dans les deux sens.** Un test qui ne tombe pas quand on
   annule le correctif ne garde rien. Annuler chaque moitié séparément et
   vérifier que le bon cas tombe.

7. **Cibler la règle, pas la première occurrence d'un motif.** Un `sed` sur la
   première des neuf occurrences ne prouve rien. Délimiter par accolades, compter
   les occurrences avant de remplacer, et asserter que le compte vaut 1.

8. **Vérifier qu'une PR existante ne porte pas déjà le correctif.** Six PR finies
   dormaient parmi les ouvertes. Et avant de rejouer une vieille branche :
   remesurer, car le défaut peut avoir été corrigé autrement entre-temps — 51 des
   63 fichiers d'une PR de deux semaines l'étaient déjà.

9. **Avant tout changement d'état en base, vérifier ce que cet état déclenche.**
   Un état n'est jamais neutre s'il arme un mécanisme automatique. J'ai failli
   remettre 196 espaces de travail à `STOPPED` pour libérer un quota : le
   ramasse-miettes supprime un espace `STOPPED` après 24 h, **PVC compris**. Le
   correctif destiné à débloquer les utilisateurs leur aurait effacé leur disque.
   Chercher qui LIT cet état — balayeur, cron, machine à états — avant de
   l'écrire.

10. **Vérifier l'existence de ce qu'on croit protéger.** Dans la foulée, j'ai
    écrit un avertissement — « réveiller le ramasse-miettes supprimerait 196
    disques » — sans vérifier que ces disques existaient. Ils n'existaient plus :
    zéro PVC correspondant dans le cluster. L'avertissement était faux, et il
    inversait la décision. Un raisonnement sur l'existence d'une chose ne vaut
    rien tant qu'on ne l'a pas listée.

**Corollaire sur les garde-fous.** Un garde-fou qui protège la mauvaise chose est
pire que pas de garde-fou, parce qu'il rassure. Vérifier qu'un test porte sur la
famille RÉELLEMENT utilisée à l'écran, et préférer une énumération dérivée du
produit à une liste écrite à la main.
