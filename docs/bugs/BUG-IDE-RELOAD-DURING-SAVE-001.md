---
id: BUG-IDE-RELOAD-DURING-SAVE-001
---

# Une lecture runtime pendant la sauvegarde réapplique un contenu ancien

## 📤 Dispatché

22 octobre 2026 : diagnostic séparé sur la base exacte 6fa009b9180f8add2e6a60e5e3be52e4155336e3. Le signal CI d’identité d’onglet (run 39797984624, job 119890497974, ligne 161) montre un retour de l’ancien contenu avant le clic de retour à l’onglet ; il passe au premier retry. Cette observation ne prouve ni sa cause ni le contenu réellement sauvegardé.

## 💻 Codé

Correctif P1 en cours : files par destination stable et chemin, identité distante transmise par le provider, liaison runtime distincte pour invalider les lectures/publications obsolètes. La version historique limitée au binding est insuffisante lors du remplacement d’un adaptateur visant le même projet. Non intégré à main. Ne pas confondre cette course dans un même projet avec l’isolation des lectures interprojets de #770 ou des complétions CRUD de #771.

## ✅ Testé live

Non certifié. Une contre-épreuve unitaire déterministe reproduit un défaut : publication optimiste du brouillon, écriture suspendue, listing lancé ensuite qui lit l’ancien disque et écrase le cache, réussite de l’écriture puis retrait de dirty, réconciliation suivante qui remet l’ancien contenu dans le document. Le disque synthétique contient bien le nouveau texte à la fin ; ce test ne démontre pas une perte sur un runtime réel ni une substitution immédiate à l’écran au seul retrait de dirty.

Le scénario rouge est conservé. La causalité du flaky CI, l’hydratation et les événements watcher restent à distinguer ; aucun délai ou retry augmenté.

Contre-épreuve complémentaire : une sauvegarde B au même chemin attendait la promesse de A malgré le changement de liaison. La garde des listings pouvait alors prolonger cette attente. Dans la version historique, la file de sauvegarde était chaînée seulement dans la même liaison ; le nettoyage tardif de A ne supprime pas celle de B. 58 contrôles unitaires ciblés passent, sans omission, incluant lecture externe ultérieure, échec, rebind et sauvegardes sérialisées. Build et contrôles généraux en cours ; aucune preuve live ajoutée.

Validation historique locale terminée sur `9375639bc` : build et typage/lint verts, 66 tests ciblés, un parcours Chromium direct. Suite finale 10 041 succès et sept omissions existantes, après conservation des erreurs initiales et d’une intermittence de collecte Sass. Non intégré à main, aucune persistance runtime réelle certifiée. [Preuves, captures et limites](reload-during-save-2026-10-22/README.md).


Contre-épreuve P1 : deux adaptateurs successifs peuvent écrire vers la même destination ; une ancienne écriture déjà envoyée peut terminer après la suivante. Le nouveau correctif conserve la file par destination à travers le rebind et A→B→A, sans empêcher B distinct d’écrire. Les 71 contrôles ciblés finaux passent sans omission, avec adaptateurs simulés. La suite déjà engagée termine avec 10 046 succès et sept omissions avant mise en forme ; aucune persistance runtime réelle ni validation live du P1 n’est revendiquée. Les reçus 937/af restent historiques et ne sont pas réécrits.
