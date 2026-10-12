# Intégration des services — 12 octobre 2026

A-5, A-6 et B-20 sont réunis dans `fix/reprise-services-coherente-20261012`, à partir de main b7a8b4b3, puis fusion réelle de a94840ab (#715). Cette dernière fusion ne comporte que des conflits de registre, sans conflit de code. Les trois fusions ont été effectuées réellement. Le conflit de l’index a été résolu par le générateur ; les clients Prisma conflictuels ont été régénérés depuis le schéma fusionné. Le catalogue conserve les 685 anciennes entrées et ajoute huit messages locataires. La garde AST des métriques et son témoin locataire sont conservés.

## Comportement tenu

Les refus de signature distinguent quota dépassé (507), inventaire indisponible (503) et gel de purge (403). Un nouveau cas couvre le gel qui apparaît pendant l’inventaire, après la première vérification : aucun URL signé n’est émis. Retirer uniquement le statut du gel fait échouer ce cas (403 attendu, 422 reçu), puis la restauration rend les dix cas de route verts.

La purge garde ses leases, barrières de stockage et de volumes, vérifications avant chaque effacement et verrouillages conditionnels. Les protections locataires et la purge automatique ne sont pas activées par cette intégration. Aucune donnée cliente n’a été supprimée.

## Mesures locales

370 cas distincts passent : 182 API hors base dans treize suites ; 29 API sur PostgreSQL réel ; deux locataires sur PostgreSQL réel ; 97 routes et cycle de vie du gestionnaire ; 19 CAS du gestionnaire sur PostgreSQL réel ; dix worker ; huit SDK ; six index ; trois métriques ; 14 scanner i18n. Les suites PostgreSQL qui interrogent la même table tournent en série. Après les dernières corrections du gestionnaire, les 97 cas, les 19 CAS, les types et le build ont repassé. Les 51 cas stockage/signature et les dix worker ont également repassé.

Types et builds API/gestionnaire/worker, types observabilité réussis. La comparaison ESLint avec main ne rapporte aucune nouvelle erreur ; la dette antérieure des grands fichiers subsiste. Le contrôle i18n réel est vert, sans augmentation du fichier de baseline : sept exceptions limitées à des chemins et textes précis, expirant le 12 janvier 2027, couvrent uniquement diagnostics internes et codes de preuve. Les handlers HTTP masquent ces diagnostics derrière le message localisé. Retirer les sept exceptions fait rougir le scanner existant ; la restauration le rend vert.

## Réserves conservées

A-5 : plafond commercial non fourni ; mesure des octets avant signature sans réservation durable des uploads concurrents ; inventaire et signature GCS récents non prouvés. La garde ne s’active pas sans plafond configuré.

A-6 : PostgreSQL utilise exclusivement des fixtures isolées ; la preuve récente d’absence réelle de buckets GCS et de PVC, le périmètre complet d’effacement et les réserves expertes demeurent ouverts. La purge automatique reste désactivée. Cette intégration n’est pas une autorisation d’activer la suppression.

B-20 : chart désactivé, séparation GCP non provisionnée. Les contrats sont testés, sans prétendre protéger déjà la production.

Ce lot n’est ni fusionné ni servi à ce relevé. Les preuves de livraison de #714 sont distinctes de ces mesures locales.


## Réintégration de la protection sortante

Main a8108ea7 (#717) est fusionné réellement. Le seul conflit dans app.ts est une ligne vide ; les exceptions i18n et messages publics des deux branches sont conservés par union avec vérification des valeurs partagées. Après cette fusion : 54 cas API ciblés verts, types et build API verts, contrôle i18n vert, types web et build web complets verts. Nouvelle comparaison ESLint des douze fichiers corrigés : aucune nouvelle erreur, aucune mutation de code supplémentaire. Les 370 cas du relevé initial ne sont pas recomptés avec ces suites voisines. Le brouillon n’est ni fusionné ni servi et ses réserves sont inchangées.

## Corrections des premiers contrôles complets

Sur f29cfdc8, Production CI 38191620390 a exécuté 9 552 cas réussis, trois ignorés et un échec : le détecteur `.env.example` trouve huit variables manquantes. Les huit définitions sont ajoutées sans activation ; les quatre cas du détecteur passent.

E2E 38191620336 refuse cinq préparations de publication par HTTP 403 : ces comptes synthétiques non vérifiés rencontrent la protection locataire activée par défaut dans l’API. La pile d’interface déclare désormais explicitement le mode observation déjà présent dans le chart. Aucune assertion navigateur ni exemption modifiée. Une garde compare la configuration API de la pile au mode du chart ; enlever cette configuration la fait rougir. Deux contre-cas de la route réelle prouvent que le même compte est accepté en observation (202, avec refus audité) et refusé en application (403). Retirer la protection fait rougir le second ; restauration verte. Validation : 17 gardes racine, 23 cas de routes locataires, types API et lint des tests avec la règle des imports relatifs adaptée au backend NodeNext. La CI complète du nouveau head reste à rejouer.

## Dépendances croisées révélées par l’intégration complète

Le head ad5a4bdd passe les unités mais l’intégration API 38194849035 rend 2 532 cas réussis, 23 ignorés et 11 échecs sur trois fichiers. Ne pas relancer ce verdict sans correction : neuf assertions de démarrage/quota échouent parce que les lectures de fichiers ne transmettent pas leur utilisateur à l’admission locataire ; deux gardes de texte utilisent une liste interne distincte du détecteur central.

Les lectures authentifiées transmettent désormais leur contexte jusqu’au démarrage (fichiers, outils, recherche, export et paquets). Les appels internes sans identité continuent à lire un agent joignable, mais ne contournent pas l’admission pour démarrer un espace. Le test du journal observe le journal de la requête, désormais réellement transmis. Les gardes de texte utilisent `applyAllowlist` avec les classifications exactes et datées déjà présentes pour le contrôle de purge ; aucun diagnostic n’est ajouté en copie dans le test.

Validation : 53 cas sur les quatre suites liées passent, types API et construction API passent, zéro erreur lint ajoutée aux lignes modifiées. Retirer le contexte utilisateur fait rougir les deux contre-cas de démarrage ; neutraliser le démarrage aussi. Retirer les classifications du détecteur fait rougir les deux gardes concernés. Restauration finale : 53 cas verts. Les réserves GCS/PVC, de quota et de périmètre demeurent.
