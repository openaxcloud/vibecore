# Borne terminale de génération : correction isolée, sans nouveau PUT partiel

Variante publiée en brouillon dans la PR #723, tête initiale 4761e24b93a4606f96832e30954a63f0d580a2b7, issue de main 27273f19029058e5e5da9e39bf46ada8d430c066. Vérification du 12 octobre 2026 : application sans conflit à main 7ce2aa9ceac014b2449d053e3991baeaea9f427d ; arbre de fusion Git local identique à celui de GitHub. Aucun déploiement de ce lot. La première CI native a échoué sur 48 erreurs de lint ; le correctif de style et d’import nécessite une nouvelle passe native complète. Les courses de persistance restent hors périmètre.

## Correction bornée

Budget sain conservé : neuf appels × 240 secondes, armé au point existant après la fusion initiale. Signal local de délai combiné au signal de requête existant, transmis aux deux appels de génération. À expiration, état terminal puis abort du fournisseur et clôture des lectures fusionnées, même si la source ignore abort ou ne termine pas cancel(). Une fin tardive conserve la persistance du texte terminé, sous l'identifiant stable ; aucune continuation tardive. Une seule revendication locale des jetons connus au registre ; délai exclu des erreurs de santé du fournisseur.

AUCUN nouveau PUT partiel au délai ou à Stop. Le corps de persisterLaReponseDuServeur est identique à main. Pas de file de persistance ajoutée. Les écritures restent liées aux fins de segment. Si le segment actif n'appelle jamais onFinish, le texte en mémoire que le navigateur n'a pas déjà enregistré peut manquer en base ; cet écart de durabilité n'est pas réparé. La persistance après déconnexion demeure best-effort, pas un travail durable en arrière-plan.

## Pourquoi séparer la persistance anticipée

La proposition précédente ajoutait un PUT partiel au délai. Sa file locale empêchait les requêtes simultanées normales, mais PAS l'ordre distant après un échec indéterminé : apiRequest possède déjà un timeout de 30 secondes. Le client peut recevoir une erreur alors que l'API/DB termine encore l'ancien PUT, après le suivant. Reproduction : premier partiel timeout → texte complet enregistré → ancien partiel enregistré en dernier. Cette proposition retire uniquement ces nouveaux PUT anticipés ; elle ne prétend pas réparer les courses de snapshots préexistantes entre clients ou requêtes.

Une file dont le premier PUT ne se résout jamais bloquerait les sauvegardes suivantes sans bloquer la réponse. Un timeout supplémentaire ne peut prouver l'arrêt distant. Toute persistance anticipée reste conditionnée à une écriture serveur atomique, revue séparément. Aucun changement API/Prisma ni migration.

## Validation réelle

- Dix tests isolés passent, dont vrai createDataStream extrait de ai@4.3.16, fermeture du lecteur, Stop, neuf segments à 215 secondes simulées chacun, absence d'arrêt après une fin saine, livraison de deux segments, sauvegarde tardive et absence de PUT anticipé.
- Six tests SDK utilisent les fake timers de Vitest dans le spec natif. Le runner isolé emploie un adaptateur de minuterie explicite et le SDK réel extrait. Seul le watchdog de blocage utilise cinq secondes réelles ; il ne décide pas de l'échéance métier.
- Seize assertions existantes portées plus le câblage du raisonnement passent. Les tests comportementaux de raisonnement existants sont conservés, mais non exécutés nativement ici.
- Typecheck strict ciblé/helper et specs avec déclarations SDK réelles et déclaration Vitest minimale ; Prettier, diff-check et application sur base exacte à vérifier dans les preuves jointes.

Non validés : Vitest natif, route complète, build/lint/typecheck globaux, authentification/live et arrêt effectif d'un fournisseur distant. L'abort émet une demande d'annulation ; un fournisseur peut l'ignorer ou avoir déjà consommé des jetons. Aucun arrêt comptable transactionnel ni garantie de coût total de 5 €. Installation de dépendances refusée après reprise, sans contournement.

## Livraison / retour arrière proposés, non exécutés

1. Revue indépendante de cette variante ; CI native sur le commit exact, sans contournement des protections. Ce lot reste un brouillon tant que ces validations manquent.
2. Livraison du tier web par le workflow habituel, séparée de #712 et des modifications API. Aucune variable ni migration.
3. Essais autorisés : chaîne saine, Stop, onglet fermé/réouverture, délai accéléré en test et lecture jusqu'à EOF ; contrôler chat.chaine.delai-depasse, absence d'erreur santé attribuée, usage connu sans doublon, transcript final si onFinish arrive.
4. Retour arrière : revert du seul commit de ce lot et redéploiement web. Pas de rollback DB ni suppression de transcript. Le défaut antérieur de flux retenu au délai reviendra ; surveiller les requêtes longues pendant ce retour.
