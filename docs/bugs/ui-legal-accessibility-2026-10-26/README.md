# Pages légales : repères, demande de documents et ancre

Base locale7759cbcbd. Aucun push, fusion, déploiement ni modification des index communs. Corps juridique, destinataires et sujets des mails conservés. Pas de certification juridique ni de recette production.

## Changements

Quatre pages exposent un main contenant leur contenu (DPA,StudentDPA,Subprocessors,ReportAbuse). Le type du signalement donne son nom accessible au groupe radio. StudentDPA active le rendu serveur déjà prévu par root pour inclure la cible download dans le HTML initial. Les libellés FR/EN annoncent une demande du document par email, conformément à leur destinationmailto, sans inventer de fichier.

Un dernier delta local sur quatre actions DPA/StudentDPA autorise plusieurs lignes, hauteurauto/min44 et icônesnonrétrécies. Le texte français complet est conservé. Ce delta vient APRÈS le build12499 : contrepreuveDOM seulement pour le repli, validation compilée finale réservée au buildcommunP2.

## Preuves avant

Examen statique de15routes ; navigateur uniquement3routes (/report-abuse,/dpa,/student-dpa), FR/EN320/1440clair =12observations. Aucunmain12/12, groupe radio anonyme4/4. AncrefroideStudentDPA4/4 reste àscrollY0, cible absenteHTML. Le clicinterne fonctionne4/4 après attente1200ms (la mesure immédiate initiale était trop précoce). Liensmailto inspectés sans activation. Subprocessors n'était couvert que statiquement avant ce lot.

## Preuves compilées12499

48observations =4routes ×FR/EN ×clair/sombre ×320/820/1440 (hauteur900). Unmain unique avec h1 sur chacune ; groupe radio nommé selon son libellé, flècheclavier disponible ; liensmailto et libellés honnêtes contrôlés.12chargements froids StudentDPA : cibleprésenteHTML et titrevisible sousheader.0POST,0erreurJS ; polices Google externes bloquées, pasde messagerie ouverte.

Limite réellement trouvée : le nouveau libelléWordFR320 dépassait son contour de7,23px àgauche/15,25px àdroite malgrérectboutoncontenu. Capturestudent-dpa-fr-light-320.png conserve ce défaut. Il interdit un verdict visuel entièrementvert sur ce build. ContrepreuveDOMavec repli puisattente400ms montre le texte intégral dans le bouton (validation/wrap-*). Dernièresclasses appliquées et revuefavorable, mais leur cascadecompiledreste àtester dans le buildcommun. Ne pas confondre48rectangles observés avec48preuves exhaustives de texteinterne.

## Validations

27tests uniques sur3fichiers passent. Le fichiercatalogue14tests a été rejoué après blanc lint puisaprès classeswrap ; cesreprises n'augmententpas le nombreunique. Lint8fichiers0 puislint2fichierswrap0 ; tscweb0 avantdeltaCSSfinal ; diffcheck0. Deuxrevues indépendantes favorables surscope etwrap (parent+final_review), détailvalidation/review.md.

Buildinitial exit137/Killed conservé. Aprèslibérationmémoire d'anciensprocessus etheap6144, retryunique exit0 ; compteurOOM inchangé durantretry. Aucune modificationproduit entrecesdeuxbuilds. Nettoyage12499 : PID/startTicks vérifiés, SIGTERM puisSIGKILL si résiduel, /procabsent etportrefusé confirmés. Lesanciens reçusAuth prouvaientportfermé maispas disparitionprocessus ; correctiondocumentée avec3résiduelspossédés supprimés, sansprocessustiers.

Nonexercés : vraiemail, POSTsignalement, compte/backendréel, navigateurautreChromium, zoom200%, clavierphysiquevirtuel, contrastequantitatif, validationdocumentjuridique. Les15routesstatiques ne sont paspromues en15routesnavigateur.

Les copies archivées des logs ont leurs espaces de fin de ligne normalisés pour passer diff-check ; les originaux bruts restent dans /tmp/ui-legal-p2-static.

## Recette finale du build commun

Le dernier repli est désormais vérifié sur le build commun P2 : [résultats après12699](after12699/README.md). Les étapes12499 et contrepreuves DOM ci-dessus restent historiques, distinctes de cette validation compilée. Aucun push, fusion ou recette production revendiqués.
