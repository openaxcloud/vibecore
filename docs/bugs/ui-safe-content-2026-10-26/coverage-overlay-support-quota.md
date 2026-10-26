# Complément de couverture — Support détail, Quota et Downgrade

Consolidation documentaire du 26 octobre 2026, sans nouveau parcours exécuté. Source : [inventaire courant précédent](../ui-coverage-2026-10-26/current-routes.json). Le [JSON de cet overlay](coverage-overlay-support-quota.json) conserve ses 357 identifiants uniques et leurs états, avec trois seules transitions `non_exerce` → `teste_local_partiel` : `routes/support_.$id`, `routes/quota-exceeded`, `routes/downgrade`. Aucun index commun ou inventaire historique modifié.

| État des identifiants de route | Précédent | Avec ce complément |
| --- | ---: | ---: |
| Partiellement exercé localement | 48 | 51 |
| Non exercé dans cette matrice | 149 | 146 |
| Réservé à une autre session | 5 | 5 |
| Hors UI | 155 | 155 |
| Total | 357 | 357 |

**Aucune page déclarée entièrement validée ou validée en production.** Les routes dynamiques comptent une fois, pas une fois par paramètre. Les 151 unités de panneaux et l’inventaire public constituent d’autres dimensions, non additives à ces 357 identifiants. Un statut non exercé signifie absence de preuve rattachée à cette matrice, pas preuve que personne n’a jamais testé cette fonctionnalité.

## Phases réellement disponibles

Les preuves ci-dessous viennent du build local servi sur **11499**, API synthétique **5999**. Elles précèdent les corrections Support/Quota. La recette compilée ciblée **11599** est maintenant disponible séparément ci-dessous ; elle ne rejoue pas toutes les géométries Support et Downgrade. Aucun résultat CI, fusion ou déploiement n’est déduit de ces observations.

Archives sources : `/tmp/ui-support-detail-next` et `/tmp/ui-quota-downgrade`. Copies durables coordonnées avec les propriétaires sous `docs/bugs/ui-secondary-pages-2026-10-26/support-detail/{before11499,after11599}` et `quota-downgrade/{before11499,after11599}`. Les reçus compilés sont distingués de leur baseline11499.

| Route et état | Formats réellement observés | Langues/thèmes | Parcours et résultat avant correction |
| --- | --- | --- | --- |
| `/support/:id`, un ticket synthétique avec longs textes et identifiants sans espaces | 320×900, 360×900, 390×900, 768×900, 820×900, 844×390, 1024×900, 1280×900, 1440×900, 1920×1080, 2560×1440 | FR/EN × clair/sombre : 44 observations | 4 groupes : saisie, resize 320→1440→844→320, Escape, Tab, lien Retour assistance puis Back. Brouillon perdu 4/4. |
| `/quota-exceeded`, état limite atteinte | 320×740, 360×800, 390×844, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | FR/EN × clair/sombre : 44 observations | 4 groupes : focus, Escape, lien Comparer les offres, Back. Upgrade non activé. Deux liens à 34 px dans les 16 observations desktop1280/1440/1920/2560. |
| `/downgrade`, abonnement actif synthétique, catalogue et limites synthétiques | Les mêmes 11 formats que Quota | FR/EN × clair/sombre : 44 observations | 4 groupes : ArrowDown/Tab, sélection locale conservée au resize320→844→1440→390→320, Escape. Aucune soumission ni changement d’abonnement. |

Les 132 observations principales ne sont ni 132 tests automatisés distincts, ni 132 parcours complets. Les 12 groupes principaux ne sont pas rejoués à chaque format. Mesures document et descendants ciblés : pas de débordement horizontal observé ni erreur JavaScript dans ces reçus. Une capture pleine page ne prouve pas à elle seule que le dernier contrôle est atteignable en paysage.

### Répétitions et récupération

- Support : 12 observations supplémentaires sans visite guidée sur320/844/1440 FR/EN×thèmes, puis4 groupes sans visite guidée reproduisant la perte de brouillon. Ce sont des répétitions ciblées, pas de nouveaux formats. Les4 tentatives non-GET de préférences lors d’Escape dans les groupes initiaux ont été bloquées dans le navigateur ; aucune requête n’a atteint l’API. Le reçu initial ne conserve que les URL, pas la méthode : PATCH ne peut donc pas être certifié par ce reçu seul. Les groupes sans visite guidée n’ont pas tenté de mutation.
- Support GET503 :2 cas FR/EN320, rendu local HTTP502 et récupération par Recharger après restauration de la fixture. Aucun envoi. L’essai initial `attempt1` s’était arrêté sur un mauvais sélecteur de navigation ; ses11 géométries ne sont pas ajoutées au total.
- Downgrade GET :4 cas FR/EN×503/403 sur320 clair. 503 récupère par Retry ; EN a nécessité un second passage ciblé après correction du sélecteur « Try again », qui ne constitue pas un cinquième cas. 403 affiche volontairement l’état limité HTTP200, sans sélection financière ; récupération après restauration et rechargement.
- Quota : le loader ne dépend pas d’un GET métier ; aucune panne fictive supplémentaire inventée. Contrepreuve DOM séparée :4 cas1440 FR/EN×thèmes, huit liens34→44px par style injecté. Ce n’est pas une preuve compilée.

### Corrections et validations distinctes

Support : garde de navigation et textarea contrôlée, abandon explicite, accusé de succès et protection du texte modifié pendant une requête. Le propriétaire rapporte28 tests verts (15 existants et13 DataRouter) et lint0, reçus `support-tests-final.log` / `support-lint-final.log`. Les premiers diagnostics de router et les rouges produit sont distingués dans `../ui-secondary-pages-2026-10-26/support-detail/validation/README.md`. Une sonde locale a mesuré les headers de Form compilée en bloquant le POST avant action/backend ; aucun envoi métier réel. La préparation initiale de fixture est distincte des neuf POST synthétiques effectivement exercés dans la phase11599 ci-dessous.

Quota : seules les deux cibles de lien passent à `min-h-[44px]` ; garde existante ajustée, rouge conservé dans `tests-before-guard.log`, validation dans `tests.log` et `lint.log`. Le seuil44px demandé n’implique pas qu’une cible34px constitue automatiquement une violation WCAG. Downgrade n’a pas de correction source attribuée à ce complément.

## Recette compilée ciblée11599

- **Quota** : [preuve compilée](../ui-secondary-pages-2026-10-26/quota-downgrade/after11599/README.md),44 observations aux mêmes11 formats FR/EN×thèmes,88 mesures de liens≥44px, contenu ciblé et document contenus. Les16 observations desktop auparavant34px passent. Quatre groupes clavier Comparer/Escape/Enter/Back, zéro erreur JS et zéro mutation tentée. Aucun CSS correctif injecté. Downgrade n’a pas été rejoué sur11599 : sa couverture reste celle de11499.
- **Support** : reçu `/tmp/ui-support-detail-next/after/receipt.json`, copie durable `../ui-secondary-pages-2026-10-26/support-detail/after11599/receipt.json`. Quatre groupes FR/EN×thèmes vérifient garde, Escape, annulation, abandon puis Back et resize ; quatre groupes de changement de query langue vérifient beforeunload annulé et conservation du brouillon. Ce n’est pas un replay des44 géométries. Huit cas d’action FR/EN sur API locale contrôlée :400,503, édition pendant requête pendante et accusé rapide ; un cas HTML vérifie PRG302. Neuf POST synthétiques en mémoire, aucun message backend réel. Quatre PATCH de préférences bloqués dans le navigateur ; zéro erreur JS. Les9 entrées `actions` comprennent les8 cas et le cas HTML, pas9 plus1.

Ces recettes lèvent les attentes de vérification compilée ciblée des deux corrections ; elles ne lèvent pas les limites ci-dessous, ni ne prouvent une livraison en production. Les reproductions avant correction restent conservées.

## Limites des trois routes

Non exercés : zoom natif200%, lecteur d’écran, Safari/Firefox, clavier virtuel OS et safeareas physiques. Pas de mesure complète de contraste de ces pages ; les seules captures ne valident pas les ratios. Support : statuts fermé/vide/403/404/429, upload et envoi backend réels non testés. Downgrade : achat, checkout, portail, changement réel, abonnement inactif, organisation absente, authentification/MFA réelles non testés. Les contenus longs observés ne couvrent pas toutes les combinaisons possibles de traductions et données. Toutes les données sont synthétiques ; aucune recette authentifiée de production.

## Domaines encore non couverts par l’inventaire courant

Les 146 identifiants non exercés restent explicitement listés dans le JSON, sans inférer une couverture à partir des panneaux voisins. Exemples de domaines présents dans cet inventaire :

| Domaine | Routes encore marquées non exercées (exemples, pas nouvelle énumération exhaustive) |
| --- | --- |
| Authentification et récupération | `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/mfa-setup`, `/recovery-codes`, callbacks OAuth |
| Administration et organisation | `/admin` et sous-routes, `/enterprise-sso-settings`, `/organization-domains`, `/scim-token-settings`, `/invitations/accept`, `/teams/:id/settings` |
| Projets et IDE | `/projects/new`, `/projects/:projectId/ide`, activité/collaborateurs/env/logs/preview/secrets/settings, routes legacy `/chat/:id`, `/editor/:id`, `/ide/:id`, imports et partage |
| Découverte et communauté | `/explore`, `/gallery`, `/marketplace`, `/community`, `/forum`, `/search`, profils publics |
| Marketing, documentation et politiques | `/about`, `/blog`, `/compare`, `/solutions/*`, `/help`, `/help-center`, `/tutorials`, diverses pages légales et confiance |
| Autres états produit | `/usage-limits`, `/subscribe`, `/connected-accounts`, `/onboarding`, `/mobile-workspace/:projectId` |

Les cinq routes réservées restent database/deployments/domains/git/snapshots sous `/projects/:projectId`. Aucun audit métier de ces périmètres n’est ajouté ici. Les preuves IDE ciblées de verrouillage du scroll ou de navigation basse, lorsqu’elles existent ailleurs, ne valent pas recette complète de toutes les routes IDE ni ne changent automatiquement leurs statuts.

Les 51 routes partielles comportent aussi des trous de couverture : dimensions non rejouées après chaque correctif, branches métier non exercées, compatibilité navigateurs et accessibilité assistée. Le menu bas demandé historiquement reste à distinguer : preuve IDE disponible, absence constatée sur AppShell dans les recettes précédentes. La marge Security de4px signalée dans l’ancien overlay possède une preuve locale ultérieure dans [le lot safe-content](README.md) ; cela ne généralise pas la conformité safearea à toutes les pages.

Contrôles documentaires :357 IDs uniques, ensemble identique à l’inventaire précédent, trois seules transitions attendues, comptes51/146/5/155,44+88 observations confirmées dans les reçus. Aucun nouveau test navigateur ou backend exécuté pour produire cet overlay. Prochains points concrets : conserver les archives compilées avec leur version et planifier les branches/compatibilités manquantes ; aucun statut de production n’est modifié.
