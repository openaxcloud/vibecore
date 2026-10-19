# Vérification avant commercialisation — 18 octobre 2026

> **Actualisation du 19 octobre, 02:42 UTC — lancement toujours non validé.** #741 est fusionnée depuis **02:38:54 UTC**, main `9d7ff755ccb99b152891ef1f426995fc35061c06`, arbre identique à la tête validée `4fcfd12a7`. Trente contrôles réussis, deux sauts ; E2E 456 cas rapportés, zéro échec/zéro flaky Chromium, six exemptions, 75/75 fichiers. WebKit séparé : 16 succès directs, un flaky, trois sauts. Le P2 du poll silencieux est reproduit et corrigé dans cette fusion. [Preuves #741](mesures/2026-10-19-pr741-result.json). Les contrôles et la livraison du nouveau main sont en cours, sans succès de déploiement confirmé. Dernière livraison réussie encore attestée : `c6439da55` le 18 octobre à 21:35 UTC. À **02:12:23 UTC**, HEAD sur les trois domaines publics reste refusé par le proxy (CONNECT 403, origine non atteinte) : [relevé actuel](mesures/2026-10-19-public-https-access.json). #738 est rebasée localement sur `9d7ff755c` : cinq fichiers quota identiques, 68 tests ciblés et types API verts ; nouvelle CI encore à exécuter. Aucun succès Stripe réel ou parcours agent/publication déduit de ces tests. Les observations suivantes restent historiques.

## Blocages précisés le 19 octobre

La [contre-épreuve de restauration](mesures/2026-10-19-restore-contract-reproduction.json)
reproduit deux défauts sur les sources main : environnement production perdu
avant provisionnement et `COMPLETED` déclenché par la seule santé du cluster,
sans bascule applicative observée. Deux passages donnent chacun deux témoins
verts et deux assertions de sécurité rouges. Fastify/provisionneur réels,
fixtures HTTP loopback et store mémoire ; aucune archive, restauration physique
ou intégrité de données validée. Les deux fiches P1 restent ouvertes.

La [revue des alertes critiques](mesures/2026-10-19-critical-advisories-review.json)
distingue quatre lignes de rapport et trois avis : Capacitor natif Android/iOS
8.3.1 doit être corrigé avant distribution native ; Tinypool 1.1.1 apparaît dans
l'outillage Vitest, avec pollution préalable du prototype requise pour les
vecteurs documentés. Aucun exploit web/API n'est démontré. Les images servies
et leurs SBOM restent inaccessibles ; les 92 alertes élevées ne sont pas couvertes
par cette revue ciblée. Ces réserves ne sont pas clôturées par la CI verte.

Le [périmètre du verdict E2E](mesures/2026-10-19-e2e-proof-scope.json) conserve six
exemptions et exclut les cas `@runtime`. Il ne remplace pas le parcours réel
inscription → agent → exécution → persistance → publication accessible.

**Décision : lancement commercial complet non validé.** Ce verdict exprime
des défauts de code reproduits et des preuves indispensables manquantes, pas
une affirmation que tous les parcours échouent en production.

Livraison précédente attestée : [#733](https://github.com/openaxcloud/vibecore/pull/733)
fusionnée à 15:32:55 UTC dans `main` sous
`615b3fcfb59c0c42cd211536ed2b2675fe72fa5f`. Les 23 contrôles de PR réussis
et deux sauts conditionnels ont précédé la fusion ; CI et E2E du commit
fusionné réussies. La [livraison](https://github.com/openaxcloud/vibecore/actions/runs/39140979431)
a réussi à **16:35:44 UTC**. Les états ci-dessous distinguent cette livraison
du relevé initial et de la preuve fonctionnelle live toujours manquante.

Ajout de reprise : #734 a fusionné les preuves documentaires à 17:12:09 UTC,
sans fichier de production ni nouvelle livraison. La correction d'horodatage
suivante a été retenue hors de main après reproduction d'une course de quota.
Le [protocole coordonné en validation](2026-10-18-workspace-admission.md)
distingue correction locale, livraison préparatoire et activation encore
conditionnée à un inventaire/drainage réel. Le verdict commercial reste inchangé.

## Actualisation du 19 octobre — 00:47 UTC

Main est désormais `bb70c7b685ab4ff5017e36b3ffa2b0f11f7fe55a` :
[#740](https://github.com/openaxcloud/vibecore/pull/740) fusionnée à
**00:44:41 UTC**, après 33 contrôles terminés, 31 succès et deux sauts
conditionnels. La palette conserve son état pendant le remplacement de coque,
Retry remplace une tentative HTTP en attente sans perdre ses consommateurs,
et le miroir Electron défaillant est retiré. Les deux refus unitaires ont
été reproduits puis corrigés sans retirer les protections ; la tête finale
`002fb3973` passe 9 754 tests racine, 2 428 API, 152 manager et 121 agent,
ainsi que les builds. L'E2E rapporte 454 cas, zéro échec persistant, une
instabilité Webview mobile et six exemptions inchangées, 74/74 fichiers.
Palette, styles et deux cas DB passent au premier essai ; la cause historique
des échecs DB reste inconnue. Trois packages Desktop, quatre audits EN/FR et
le canari WebKit (17 succès/trois sauts existants) passent.
[Résultats et liste des fichiers](mesures/2026-10-19-pr740-result.json).

La [CI de main](https://github.com/openaxcloud/vibecore/actions/runs/39182148503),
ses [E2E](https://github.com/openaxcloud/vibecore/actions/runs/39182148514)
et son [déploiement](https://github.com/openaxcloud/vibecore/actions/runs/39182148402)
sont en cours à ce relevé. **Fusion ne signifie pas livraison.** La dernière
livraison réussie attestée reste #735 à 21:35:00 UTC le 18 octobre ; les
changements #736/#737 restent non livrés. La version réellement servie sur
les domaines publics demeure inconnue, faute d'accès HTTPS à l'origine.
L'audit dépendances conserve 242 alertes, dont quatre critiques : aucun
constat d'absence de vulnérabilité ou d'inaccessibilité runtime n'en est déduit.

#738 est réactualisée sur cette base, avec code quota identique et index
régénéré ; ses nouveaux contrôles restent requis. Les cinq critères de
lancement ci-dessous et leurs dépendances externes restent ouverts. La
[relecture de restauration sur les fichiers actuels](mesures/2026-10-19-restore-main-recheck.json)
confirme la distinction : encodage binaire corrigé par #737, mais contrat
PITR, sélection d'environnement, bascule et convergence toujours non validés.
Aucune nouvelle ressource payante, donnée client ou opération cloud utilisée.

## Historique de la reprise du 18 octobre — relevé à 23:37 UTC

[#735](https://github.com/openaxcloud/vibecore/pull/735) est fusionnée depuis
**20:09:07 UTC**, commit `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`.
Les 29 contrôles ont terminé avant fusion : 28 succès et un saut conditionnel.
Le verdict E2E de la tentative 2 couvre 453 tests et 73/73 fichiers : zéro
échec, deux instabilités et six exemptions préexistantes inchangées. Le premier
rouge reste conservé ; son origine n'est pas établie. [Preuves et fichiers exacts](mesures/2026-10-18-pr735-result.json).

La CI du commit fusionné a réussi : 9 656 tests racine passent (4 sauts),
2 418 API (23 sauts), 152 manager et 114 agent. Les builds passent.
Son audit dépendances reste un avertissement : 242 alertes, dont 4 critiques.
L'E2E de main a réussi à 20:36:25 UTC sans relance du workflow : 453 tests
rapportés, zéro échec persistant, cinq instabilités passées avec les retries
préexistants, six exemptions inchangées et 73/73 fichiers. Le [déploiement](mesures/2026-10-18-deployment-c6439da735.json) a réussi à **21:35:00 UTC**. Runtime, web, agent et admin ont été reconstruits ; scan des digests et signatures acceptés. Helm : 21:28:13–21:34:17 ; rollout : 21:34:17–21:34:30 ; comparaison des imageIDs : 21:34:30–21:34:50. Le contrôle bloquant du ConfigMap réel fait partie de cette étape réussie. Ses valeurs brutes, le manifeste et les journaux détaillés restent inaccessibles ici ; cette preuve indirecte est distinguée d’une lecture opérateur. Les trois domaines publics restent refusés par le proxy après livraison, à 21:35:50 UTC.
**V2 reste désactivé** : cette fusion n'autorise pas son activation. La dernière
livraison réussie attestée est désormais #735. Aucun nouveau parcours en production
n'est prouvé.

[#736](https://github.com/openaxcloud/vibecore/pull/736), tête `c4300e60dd`,
a été rebasée sur le commit fusionné de #735 ; aucun conflit restant. Sa CI et ses quatre audits EN/FR sont verts. Le verdict E2E du premier
passage couvre 453 cas, zéro échec et zéro instabilité, avec six exemptions
existantes et 73/73 fichiers. Le canari WebKit a échoué avant tests sur le
port Docker occupé ; sa seule reprise ciblée a réussi : 17 tests passent, trois sauts préexistants
subsistent. La PR a été fusionnée à **20:54:14 UTC** dans `b827b12255d423ffb96143c39c1d2a3917ffc5e2`, après 32 contrôles réussis et deux sauts conditionnels. La CI de ce commit a réussi à 21:09:23 UTC : 9 714 tests racine (4 sauts), 2 418 API (23 sauts), 152 manager, 114 agent et builds verts. Le canari WebKit a réussi avec 17 tests et trois sauts existants. **Les E2E de main ont échoué** : 453 tests rapportés, un échec persistant (titre du panneau des tables absent sur trois essais), cinq instabilités, six exemptions et 73/73 fichiers. La livraison a été refusée par sa barrière à **21:35:38 UTC**, avant build et rollout. Aucune relance identique demandée. [Diagnostic, limites et capture inaccessible](2026-10-18-main736-mobile-diagnostic.md). Aucun déploiement réussi de ce changement ni résultat public live n'est encore établi.
[Preuves de cette tête](mesures/2026-10-18-pr736-result.json). Sur l'ancienne tête `646ad466ae`, CI et audit EN/FR
ont réussi, ce dernier après reprise ciblée du démarrage Docker tablette ;
l'E2E comptait toujours un échec persistant (liste des tables), une instabilité,
six exemptions existantes et les 73 fichiers attendus. Ces résultats ne sont
pas attribués à la nouvelle tête. Celle-ci ajoute aux journaux uniquement les
métadonnées de diagnostic déjà collectées en cas d'échec, sans contenu de
requête, URL, secret ou texte DOM. Aucun seuil, retry ni exemption ne change.

Le [rejeu local ordonné des 45 cas mobiles](mesures/2026-10-18-pr735-mobile-ordered-local.json)
sur la tête exacte de #735 termine à 20:25:46 UTC : **44 passent, un échoue**,
sans retry. Streaming et les deux cas de base de données passent au premier
essai. Le défaut distinct observé et [inspecté sur capture](captures/2026-10-18-publication-fr390-failure.png)
est le bouton « Voir les journaux » sur deux lignes dans l'état de publication
en échec à 390 px en français. Ce résultat ne prouve ni une génération réelle,
ni une publication accessible, ni Safari, ni la cause des instabilités CI.

Une [contre-expérience locale](mesures/2026-10-18-database-panel-delivery-gate.json)
retient puis livre intacte une vraie réponse HTTP du panneau DB : le titre
reste absent derrière `aria-busy=true` malgré l'onglet actif, puis le panneau
et 128 tables du PostgreSQL QA réel apparaissent. Le temps de réponse amont
mesuré est 539 ms ; **le retard de livraison est imposé volontairement**.
Captures chargement et tables inspectées ; aucune donnée de ligne ni valeur
de connexion n'est incluse. Ceci prouve un mécanisme possible, pas la cause
ni une lenteur constatée en CI. Les processus locaux possédés sont arrêtés ;
quatre zombies réadoptés par PID1 ne sont pas des serveurs actifs.

Le correctif de restauration [#737](https://github.com/openaxcloud/vibecore/pull/737), tête `80c38626a`, a été **fusionné à 21:36:26 UTC** dans `c4211323345cc8e0688a191337a04af9e3b2fab9`, après 24 contrôles terminés (22 succès, deux sauts). La CI de PR passe : 9 714 tests racine, 2 428 API, 152 manager, 121 agent ; E2E : 453 rapportés, zéro échec persistant, une instabilité, six exemptions, 73/73 fichiers. La CI du commit fusionné réussit, mais son E2E échoue et sa livraison est refusée avant build (détail ci-dessous). Il refuse
une création/restauration d'instantané sans archive au lieu d'annoncer un
succès sans fichiers restaurés. Ses validations après rebase passent : API 27/27, agent 121/121,
index 6/6, typecheck API complet et aucun diagnostic lint ajouté. Il ne fournit pas une sauvegarde durable : la restauration DB et
la convergence du Pod restent à établir ; des défauts distincts de contrat
ont été relevés sur ces chemins. Aucune restauration cloud n'a été exécutée.
Il conserve aussi l’encodage binaire jusqu’à un vrai agent HTTP : la contre-épreuve sur main écrit douze caractères base64 au lieu des sept octets attendus ; le correctif restaure les octets exacts. Le second des [deux candidats validés](2026-10-18-candidats-valides.md), qui corrige les collisions de ports CI, reste hors de main et sans PR. La correction des quotas annuels est en [PR #738](https://github.com/openaxcloud/vibecore/pull/738), tête initiale `c33c913b5` : 68/68 tests API, 16/16 contrôles d’index, typecheck/build API réussis, aucun nouveau diagnostic lint. Les contrôles financiers restent identiques. Aux tests Fastify `inject` sur store mémoire s’ajoute une [contre-épreuve Prisma/PostgreSQL réelle et locale](mesures/2026-10-18-annual-quota-postgres-local.json) sur `bee26fd2` : 100 migrations dans une base temporaire dédiée, usage précédent exclu (0, autorisé 200), plafond courant atteint (1 000, refus 429), dates annuelles/PAYG/plafond personnel préservés. L’ancienne borne annuelle reproduit le refus via l’agrégation PG et `assertQuota`, sans réexécuter l’ancien handler. Webhook synthétique signé, zéro appel Stripe/cloud ; base supprimée et absence vérifiée. [Preuves et limites](mesures/2026-10-18-pr738-result.json). Sa première CI passe : 2 453 tests API ; E2E 453 rapportés, zéro échec et zéro instabilité. Ces résultats portent sur `c33c913b5`. Le rebase sur #737 a produit `bee26fd28` : correctif billing identique, modifications #737 conservées, index régénéré officiellement à 433 entrées, 68 tests API et six contrôles d’index réussis, gitleaks sans fuite. Les résultats du nouveau SHA, détaillés ci-dessous, restent distincts des résultats précédents : CI réussie, E2E rouge. #738 reste ouverte et non livrée ; #737 est fusionnée mais non livrée.
La [relecture de la restauration sur main actuel](2026-10-18-restore-current-main.md)
confirme les défauts distincts avec des références au commit `c6439da`.

La CI de main après #737 est verte à 21:54:27 UTC, mais son E2E échoue à
21:56:47 UTC : 453 rapportés, un échec persistant de palette, zéro
instabilité, six exemptions, 73/73 fichiers. La livraison est **refusée à
21:57:16 UTC avant build et rollout**. [Preuve distincte du résultat de PR](mesures/2026-10-18-main737-failure.json).
Les tests DB passent cette fois au premier essai : cela ne résout pas leur
cause antérieure. La restauration binaire est fusionnée mais non livrée.

Sur la tête exacte `bee26fd28` de #738, la CI est verte à 22:02:07 UTC
(9 714 racine, 2 463 API, 152 manager, 121 agent ; builds réussis), mais le
verdict E2E à 22:04:57 UTC est **rouge** : 453 rapportés, un échec DB
persistant sur les trois tentatives, quatre instabilités, six exemptions,
73/73 fichiers. **#738 reste ouverte, non fusionnée et non livrée.** Aucun
relancement identique ni contournement n’est demandé.

Une [contre-épreuve locale réelle de la palette](mesures/2026-10-18-palette-handoff-local.json)
reproduit une perte d’interaction au remplacement de la coque provisoire
par le vrai Chat : ouverte avant livraison d’une réponse `ide-state` 200
retenue, la palette disparaît quand les anciens nœuds sont démontés.
[Capture avant](captures/2026-10-18-palette-before-handoff.png) et
[capture après](captures/2026-10-18-palette-after-handoff.png) inspectées.
Le build local existant utilise huit sources pertinentes identiques à
`c421` ; le retard est imposé et **l’attribution au run CI reste inconnue**.
Le correctif local passe désormais la nouvelle régression et le cas historique
de style : deux cas Chromium, zéro retry, captures inspectées. Un second
défaut est reproduit : le bouton Réessayer ne relance aucune requête lorsque
la première reste en attente. Son correctif conserve les consommateurs et
remplace la tentative HTTP, avec contre-épreuves et tests loopback verts.
[Preuves et limites des deux corrections](2026-10-18-ide-recovery-defects.md).
Les deux candidats et le diagnostic sont validés localement sur une branche
issue de `43eef614`, sans assouplissement des contrôles : 88 tests ciblés,
typage web/tests, build client/SSR, puis deux cas Chromium sans retry
sur le lot `6365455b6`, captures inspectées et nettoyage QA réussi.
[Preuve intégrée](mesures/2026-10-18-ide-recovery-integrated.json).
Le lot est publié en [PR #740](https://github.com/openaxcloud/vibecore/pull/740),
tête `f2af72cb4`. Sa première CI est refusée au typage : le nouveau test
navigateur était inclus dans le périmètre Node sans DOM. Le déplacement du
test et un contrôle DOM strict obligatoire passent localement, sans retrait
des contrôles existants ; ils attendent validation sur la nouvelle tête.
Les trois packages Desktop échouent séparément au téléchargement d’Electron
(HTTP 504). Les quatre audits EN/FR et la nouvelle régression de palette
passent ; WebKit rapporte 17 succès et trois sauts préexistants. Le verdict
E2E complet réussit à 23:26:28 UTC : 454 rapportés, zéro échec et zéro
instabilité, six exemptions inchangées. Les deux cas DB passent au premier
essai (24,2 s et 24,8 s), sans nouvelle métadonnée d’échec ; leur ancienne
cause demeure inconnue. [État exact de cette tête](mesures/2026-10-18-pr740-first-head.json).
Deux [scénarios DB réels locaux à 390 px](mesures/2026-10-18-ide-recovery-mobile-local.json)
passent sans retry, avec captures inspectées et nettoyage confirmé ; une
barre de requête serrée reste visible. La panne DB CI demeure non attribuée.
Sur `133c8ecc0`, le typage complet passe en CI ; le téléchargement Desktop
répète toutefois le même 504 sur Linux et Windows. La correction minimale
retire le miroir hérité et revient aux archives officielles existantes.
Builds locaux main/preload, smoke test et six contrôles d’index passent ;
le packaging officiel et les contrôles de la tête qui suit restent à valider.
[Preuve, résultats incomplets et limites](mesures/2026-10-18-desktop-mirror.json).
Aucun de ces changements n’est encore fusionné ou déployé.
La validation intégrée a ensuite identifié un défaut du lecteur de styles
du test : trois des six observations supplémentaires lisent un ancien nœud
détaché (rayon vide), alors que le menu courant est connecté avec `12px`
au même instant. Ce rouge local est attribué et consigné ; la lecture
atomique passe désormais ses contre-épreuves de CSS incorrect et de menu absent. L’ancien rouge CI et la panne DB ne sont
pas réattribués sans preuve.

Le [diagnostic DB instrumenté](https://github.com/openaxcloud/vibecore/actions/runs/39170180476)
a démarré à 21:58:37 UTC sur `a78c7766`, avec le workflow existant et le
seul fichier `ide-mobile-chrome.spec.ts`. Ce fichier est exécuté séparément
par les quatre jobs : leurs résultats ne constituent pas quatre ensembles
de cas uniques. Il a terminé avec 45 cas uniques, zéro échec persistant
et une instabilité ; les deux cas DB passent au premier essai dans les
quatre jobs. [Résultat ciblé](mesures/2026-10-18-mobile-db-diagnostic-targeted-result.json).
Le [run complet instrumenté 39171191591](https://github.com/openaxcloud/vibecore/actions/runs/39171191591)
conserve l’ordre original et termine à 22:30:58 UTC : 453 rapportés, zéro
échec persistant, deux instabilités, six exemptions inchangées, 73/73 fichiers.
[Résultat complet](mesures/2026-10-18-mobile-db-diagnostic-full-result.json).
Aucun échec DB n’a fourni de nouvelles métadonnées : la cause reste inconnue.
Ces deux runs précèdent les correctifs UI et ne prouvent pas leur effet.

Les [quatre alertes critiques](2026-10-18-security-triage.md) sont qualifiées
partiellement : deux résultats Capacitor natif et deux advisories Tinypool
via le moteur de tests ; ni exploitation web ni innocuité des images servies
ne sont déduites de ce décompte.

Le relevé des [24 PR actuellement ouvertes au moment de la lecture](mesures/2026-10-18-open-pr-file-audit.json)
a vérifié tous les fichiers et la stabilité des têtes. Parmi les 22 anciens
brouillons, #324 seule porte des suppressions : 26 fichiers dans son diff,
dont 21 déjà absents de main et cinq encore présents. La simulation de fusion
sans modification d'index relève trois conflits, dont un modify/delete sur
`Pricing.tsx`. Cette page historique n'est pas la page actuellement routée ;
des tests lisent encore ses sources. Aucun nettoyage ancien n'est repris ni
fusionné. #414 vise une branche de travail, pas directement main.

La livraison continue utilise `group: deploy-production-continuous` et
`cancel-in-progress: false`, sans `queue: max`. La [documentation GitHub
vérifiée le 18 octobre](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
précise que la configuration par défaut ne conserve qu’une exécution en
attente ; une nouvelle arrivée peut la remplacer. Cette attente a préservé le démarrage de #736 après #735. Sa barrière a
ensuite refusé le commit rouge ; #737 a été fusionnée seulement après ce
verdict terminal. Les fusions suivantes doivent préserver la livraison active.
Aucun contrôle de livraison n’est contourné.

Les relevés suivants conservent leur date et ne remplacent pas cet état.

## Les cinq conditions de lancement — état vérifié à 23:37 UTC

Main est `43eef614ec3c56d8b7642f105b140e938f6868ef` après la fusion
documentaire #739 à 22:32:21 UTC : 33 fichiers, aucun de production.
[Contrôles exacts et fusion](mesures/2026-10-18-pr739-result.json).
La CI de ce main passe à 22:55:03 UTC ; ses E2E complets échouent à
22:56:38 UTC : 453 rapportés, deux échecs DB persistants sur trois essais
chacun, deux instabilités, six exemptions et 73/73 fichiers.
[Preuve exacte](mesures/2026-10-18-main739-validation.json).
Aucune nouvelle livraison produit observée. Les E2E de PR sautés pour le
périmètre documentaire ne sont pas de nouveaux tests navigateur.
La dernière livraison terminée est #735, `c6439da55` ; #736 a été
refusée par sa barrière ; celle de #737 est également refusée après son échec E2E. Les contrôles locaux et CI ci-dessous
ne remplacent pas un parcours réel sur la version servie.

| Condition indispensable | Code, tests et intégration établis | Preuve de clôture encore nécessaire |
| --- | --- | --- |
| Compte neuf → génération → exécution → sauvegarde → publication → URL utilisée | Parcours et composants présents. Le [tri des 18 échecs runtime](2026-10-18-runtime-triage.md) distingue 7 dérives d'assertion, 4 prérequis runtime manquants, 5 parcours mobiles et 2 défauts d'interface non attribués. Aucun parcours runtime réussi établi. | Compte QA neuf et boîte mail autorisés ; génération réelle avec budget explicite ; exécution et écriture puis réouverture ; URL publiée utilisée depuis une session extérieure. |
| Démarrage et consommation conformes au forfait | #733 fusionnée et livrée. #735 fusionnée et livraison réussie ; garde bloquante du ConfigMap live passée, valeurs brutes non lues ici. Protocole d'admission coordonnée et barrières de suppression présents ; réservations V2 désactivées dans la livraison. | Lecture opérateur du ConfigMap en complément de la garde CI réussie (lecteur activé, réservations désactivées), CPU/RAM/stockage effectivement attribués, quota concurrent observé. Inventaire/réconciliation legacy et drainage avant toute activation V2. |
| Paiements, catalogue mensuel/annuel et droits | Route `/pricing` actuelle, clés Pro/Team, prix et transmission du choix annuel cohérents par code. **Défaut reproduit : les quotas annoncés par mois restent consommés pendant toute la période annuelle Stripe.** [Contre-épreuve locale](mesures/2026-10-18-billing-annual-period.json) : après consommation en janvier, refus 429 en février avec zéro consommation du mois ; témoin mensuel accepté. Correctif en PR #738, tests locaux verts. | Correction intégrée et validée du quota annuel. Stripe TEST autorisé : mensuel/annuel, webhook signé/idempotent, droits après confirmation, refus/annulation et changement de formule. Aucun paiement ni changement client sans accord précis. |
| Isolation et restauration réelle | API locale avec PostgreSQL : 8 lectures autorisées et 8 accès inter-organisations refusés, écriture croisée refusée et contenu propriétaire conservé. Faux succès des snapshots runtime et corruption des octets binaires reproduits ; corrections fusionnées dans #737, non encore livrées. Défauts PITR distincts [confirmés sur main](2026-10-18-restore-current-main.md). | Refus croisés réseau/GCS/PVC sur deux organisations QA ; suppression/retry ; restauration isolée PostgreSQL/GCS/PVC avec intégrité, convergence et durée mesurées. Les archives projet ne prouvent pas une sauvegarde complète du runtime. |
| Mobile et Safari, erreurs honnêtes | #736 fusionnée : faux indicateurs de disponibilité remplacés par un état inconnu ; livraison refusée après un échec persistant des E2E de main. Cause du panneau DB non établie. CI de PR : 453 E2E rapportés, zéro échec et zéro instabilité, six exemptions ; WebKit ciblé 17 succès/3 sauts. Six captures Chromium EN/FR inspectées. Rejeu local ordonné : 44/45 ; bouton de journaux sur deux lignes à 390 px en français, capture inspectée. | Parcours critique authentifié sur petits écrans et Safari HTTPS, idéalement appareil physique : clavier, navigation, reconnexion, sauvegarde et publication. Vérification des erreurs et de la version réellement servie après rollout. |

La preuve du défaut annuel utilise des closures de production extraites par
AST et des fixtures mémoire, sans requête Stripe, HTTP ou PostgreSQL.
Les 23 tests isolés existants de prix/upgrade passent ; ils ne détectaient
pas cette fenêtre de consommation. Aucun paiement n'a été déclenché.

Accès restant bloquant : HTTPS des domaines publics refusé par le proxy
(`CONNECT 403`, aucun code HTTP origine), pas d'accès opérateur GCP/Kubernetes,
pas de comptes QA/mailbox ni Stripe utilisables ici. Les logs du job de livraison
#733 restent illisibles (`Transport closed`) ; les captures référencées par
GitHub ne peuvent pas être copiées localement (`CONNECT 403`). Ces refus ne
prouvent aucune panne des domaines. Aucun contournement effectué.

À reporter seulement si exclus explicitement de l'offre : natif/desktop,
SSO Enterprise, connecteurs secondaires, parité visuelle exhaustive et
optimisation de durée CI. Les cinq conditions ci-dessus ne sont pas reportables
dans une déclaration de lancement complet. Aucun délai global fiable n'est
annoncé : les accès, les résultats live et les dépendances Stripe/restauration
ne sont pas établis. La mesure de collisions sur 24 h reste une durée
d'observation minimale documentée, pas une validation déjà obtenue.

## État initial et accès

Relevé GitHub et local commencé à 14:41 UTC. Main et checkout initial propre :
`3f6acb9cfb9d0b6647cea8fc8c0080fe5d55d7f9`, dernière fusion #732 le
13 octobre à 03:04:22 UTC. Les quatre registres, AGENTS.md, CLAUDE.md,
PROBLEMES.md et SERVI-POUR-LES-SESSIONS.md ont été consultés. Le relevé du
11 octobre est une source historique, pas le résultat de cette vérification.

- 22 PR ouvertes, toutes en brouillon au relevé initial ; leurs têtes et titres
  sont conservés dans [les mesures](mesures/2026-10-18-readiness.json).
- [CI](https://github.com/openaxcloud/vibecore/actions/runs/38339948488) et
  [E2E locale](https://github.com/openaxcloud/vibecore/actions/runs/38339948452)
  du SHA de main réussies. L'E2E locale exclut les scénarios `@runtime`.
- [Dernière livraison](https://github.com/openaxcloud/vibecore/actions/runs/38339948482)
  terminée le 13 octobre à 03:47:03 UTC ; seul web reconstruit. Les étapes
  Helm, rollout et comparaison des imageIDs sont vertes. Les identifiants
  d'artefacts sont relevés ; leur contenu n'a pas pu être téléchargé dans le
  workspace, donc aucune nouvelle attestation du manifeste complet n'est faite.
- Le [job du 18 octobre](https://github.com/openaxcloud/vibecore/actions/runs/39127639075/job/117676021171)
  lit les spécifications des pods et les valeurs Helm vers 12:33 UTC : web
  `3f6acb9cfb`, digest `sha256:aeafc795f5ca6ce1ead587839f0f89184a15d121ca787cb0f717a4321dec4971`.
  Il parcourt tous les namespaces et lit `spec.containers.image`, pas les
  `status.containerStatuses.imageID` ni le routage HTTP des domaines. Deux
  références ai-gateway sont recensées ; leur portée ne peut pas être déduite
  de ce journal seul. Les autres tags Helm sont `dfd1d1f071`.
- `curl --head https://e-code.ai` et `https://app.e-code.ai` refusés par le
  proxy de cet environnement : `CONNECT tunnel failed, response 403`.
  L'outil web n'accède pas non plus aux deux URL. Ce refus ne mesure pas leur
  disponibilité externe. Aucun accès opérateur GCP/Kubernetes, compte QA de
  production ou connexion Stripe utilisable ici.
- La branche expose trois checks requis : `Install, test, build, scan`,
  `Playwright local stack`, `Quality Gates`. La lecture détaillée de la
  protection est refusée (`Resource not accessible by integration`, 403).
  Le check `Quality Gates` est défini dans `pr-release-validation.yaml`,
  déclenché uniquement sur les PR. Son absence des contrôles du commit de
  main n’est donc pas une preuve de défaut de protection. Il attend la CI
  et les deux analyses CodeQL ; aucun contrôle ni protection modifié.

## Blocages et inconnues au relevé initial

| Indispensable                                                        | Preuve actuelle et condition de clôture                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inscription → agent → exécution → persistance → publication publique | [Runtime nocturne du 18/10](https://github.com/openaxcloud/vibecore/actions/runs/39097365302/job/117586475206) : 18 échecs, 0 succès ; workflow vert car job non bloquant. Aucun runtime n'est provisionné par ce workflow. Les logs montrent aussi des sélecteurs ambigus et transitions mobiles : ne pas attribuer tous les échecs à une cause unique. Un compte QA neuf doit terminer le parcours sur la version servie, puis rouvrir les fichiers et exercer l'URL publiée. |
| Ressources et stabilité du workspace                                 | Défaut de contrat reproduit sur main : démarrage automatique gratuit sans droits, contre démarrage explicite selon abonnement. Correctif ciblé ci-dessous. Le défaut de relance pendant STARTING de #708 reste distinct ; sa mesure de collisions sur 24 h n'a pas été réalisée.                                                                                                                                                                                                |
| Facturation et quotas cohérents                                      | Les garde-fous annuels sont présents, mais aucun catalogue/prix Stripe réel ni exercice de webhooks n'est vérifié aujourd'hui. Le manager n'accepte que free/pro/team/enterprise ; le catalogue connaît aussi starter/core et le nom sert au metering. Ne pas convertir les noms arbitrairement. La route d'URL d'upload appelle directement `createUploadUrl` sans réservation durable de quota commercial ; la limite par objet existe.                                       |
| Isolation et données                                                 | Les modules `object-storage-quota.ts`, `tenant-admission.ts` et `account-storage-purge.ts` proposés dans #718 sont absents de main. Sa préparation reste non intégrée ; cette absence ne signifie pas qu'aucune sécurité n'existe. Rejouer les refus inter-organisations, réseau, jetons, GCS/PVC et les réserves de purge sur un environnement isolé autorisé. Aucun drapeau de purge ou d'enforcement modifié.                                                                |
| Sauvegarde et restauration                                           | BACKUP_RESTORE.md et DISASTER_RECOVERY.md décrivent un processus et des objectifs ; le dry-run local chiffre/restaure quatre fichiers temporaires. Ils ne prouvent pas une restauration récente de PostgreSQL, GCS et PVC. Exiger une restauration isolée avec contrôles d'intégrité et temps réellement mesurés.                                                                                                                                                               |
| Mobile, Safari et erreurs honnêtes                                   | Les correctifs #730–#732 sont sur main. Le canari WebKit de cette CI est vert ; cela ne prouve ni Safari sur iPhone physique ni les parcours authentifiés actuels. Vérifier le parcours critique à 390/768/1440, déconnexion/réouverture, sauvegarde, erreur agent et échec de publication, avec captures inspectées. Aucun nouveau verdict visuel live dans cette session.                                                                                                     |

## Correction isolée du contrat de ressources

La [PR #708](https://github.com/openaxcloud/vibecore/pull/708) est relue avant
de produire du code neuf. Ses deux fichiers : app.ts modifié (+102/-27) et
test ajouté (+322), aucun fichier supprimé. Sa branche n'est ni modifiée ni
fusionnée. Sa suite portée temporairement sur main reproduit 7 échecs sur
13 cas ; ces cas ne constituent pas des preuves Kubernetes.

La correction centralise plan/CPU/RAM/stockage pour les quatre corps de
démarrage des forfaits historiques free/pro/team/enterprise. Elle préserve
explicitement le contrat automatique existant de starter/core, pour ne pas
transformer un démarrage auparavant accepté en nom refusé par le manager ni
changer leur metering sans migration coordonnée. La lecture de facturation précède
la réservation du créneau et ne masque pas un échec. Elle reprend le contrat
utile de #708, sans son fallback silencieux, sa conversion de noms de forfait
ou son changement d'état après erreur, qui demandent d'autres garanties.

Épinglage : `services/api/src/tests/workspace-provision-resources.spec.ts`.
Neuf tests API/HTTP isolés verts dans la validation finale. La contre-épreuve
sur les sept cas initiaux avec app.ts de main donne six rouges, un vert. Serveur HTTP enregistreur et magasin en mémoire explicitement
limités au banc de tests. Les droits du catalogue et leurs surcharges sont
comparés à la construction réelle du manifeste de pod. Aucun pod créé.
Typecheck API et build API passent. Validation finale : 12 fichiers, 126 tests passés et 3 sauts préexistants,
sans modification de dérogation ; les neuf cas ciblés sont inclus dans ce
total. Six gardes d'index passent séparément. Lint différentiel : 338 messages
préexistants sur app.ts, aucun ajouté ; nouveau test sans diagnostic. Scan des
substituts de runtime propre. Format du nouveau test et des documents vérifié ;
app.ts conserve les écarts de format préexistants hors du correctif.
Les [mesures de validation](mesures/2026-10-18-resources-validation.json)
conservent les commandes, les versions et les empreintes des sources testées.

Contre-revue indépendante transmise par le parent à 15:40 UTC : aucun défaut
bloquant introduit identifié. Limites conservées : aucun nouveau cas direct
sur le redémarrage administrateur ; état RUNNING couvert uniquement pour
la panne de facturation ; ni PVC réel ni concurrence de pods exercés. Sur
le chemin de lecture, la panne de facturation reste journalisée en
arrière-plan et la réponse 425 existante est conservée. La protection contre
un démarrage gratuit implicite ne constitue donc pas une nouvelle preuve
de qualité de restitution de cette erreur à l’utilisateur.

## Livraison du correctif et limites de preuve

Le runtime a été reconstruit de 15:56:48 à 16:24:37 UTC. Web, admin et
workspace-agent n’ont pas été reconstruits. Scan des digests réussi à
16:28:30, signatures vérifiées, manifeste validé, Helm terminé à 16:34:48,
rollout vérifié à 16:35:06 et comparaison des imageIDs réussie à 16:35:32.
Aucun rollback exécuté. Les sondes de bascule d’activation SEC-8/SEC-9 sont
sautées dans ce run ; elles ne constituent pas une validation fonctionnelle
supplémentaire. Les [mesures](mesures/2026-10-18-deployment-615b3fcfb5.json)
conservent les étapes exactes et identifiants des trois artefacts.

La lecture des logs du job de livraison échoue (`Transport closed`) alors
que les journaux CI sont lisibles. L’archive est référencée mais sa copie
locale échoue aussi par les deux routes essayées. Le contenu intégral du
manifeste et les valeurs brutes des imageIDs ne sont donc pas attestés
par lecture directe dans cette session. La comparaison réussie est attestée
par le résultat du workflow. Les annotations conservent `sourceSha: null`
pour web/admin/workspaceAgent repris. Le SHA de main ne doit pas être
présenté comme le SHA directement lu sur les deux domaines web.

Le contrôle des valeurs Helm, effectué **avant** l’upgrade, signale cinq
écarts : web utilise 256Mi/768Mi (demande/limite mémoire) en production
contre 384Mi/1Gi dans le fichier ; screenshotter 1Gi/2Gi contre 512Mi/1Gi ; `maxReplicas` absent
des valeurs stockées contre 2 dans le fichier. Ce garde est consultatif :
il ne prouve ni une panne ni que baisser la mémoire serait correct.
L’origine des réglages doit être tranchée avec l’exploitation ; aucune
valeur de dimensionnement n’a été forcée par cette session.

À [16:38:27 UTC après livraison](mesures/2026-10-18-http-after-rollout.json),
`e-code.ai`, `app.e-code.ai` et `api.e-code.ai/health` restent refusés par le
proxy (`CONNECT 403`, code HTTP de l’origine absent). La version réellement
retournée par ces domaines et le parcours utilisateur demeurent non vérifiés.
Les [comptages CI de main](mesures/2026-10-18-main-ci-counts.json) confirment
les neuf nouveaux cas dans les 2 402 tests API passés (23 sauts) ; ces chiffres
ne s’ajoutent pas aux tests locaux qui en sont un sous-ensemble.

## Dépendances vulnérables : portée à distinguer

Le journal de CI de #733 rapporte 242 alertes `pnpm audit` : 28 basses,
118 modérées, 92 élevées et 4 critiques. Cette étape est consultative et
inclut les dépendances de développement ; ce décompte ne mesure pas les
failles exploitables du service déployé. Le [tri initial](mesures/2026-10-18-dependency-audit-triage.json)
conserve les références et les limites de preuve.

Deux alertes critiques concernent [Capacitor natif iOS/Android](https://github.com/advisories/GHSA-rvm3-566m-v7fv),
les deux autres [Tinypool via Vitest](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
et [ses options d’exécution](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
Le Dockerfile des dépendances serveur exclut le mobile ; le manifeste admin
actuel place Vitest en développement. Les gardes de ces contrats passent
en CI et `pnpm why -r tinypool --prod --json` ne rapporte aucun chemin de
production dans l’installation locale. Ces constats ne remplacent pas le
SBOM des images effectivement servies. Les risques de la chaîne de tests et
le tri des alertes élevées restent ouverts ; aucun override de dépendance ni
assouplissement de contrôle n’a été ajouté ici.

## Limite de diagnostic Cloud Build

Le job de livraison `117720182233` a commencé `Build runtime tier` à
15:56:48 UTC. Pendant son exécution, le téléchargement de ses logs GitHub
répond `404 BlobNotFound` ; le statut actif ne prouve pas une progression
interne. Aucun connecteur GCP, exécutable `gcloud`/`kubectl`, variable
d’identité GCP, fichier ADC standard ou kubeconfig n’est disponible dans
ce workspace. Seule la présence de ces configurations a été examinée,
aucun secret affiché. Le workflow n’exporte `RUNTIME_BUILD_ID` qu’après le
retour de `gcloud builds submit`. Une lecture Cloud Build directe exige
donc un accès opérateur supplémentaire. La construction a ensuite réussi
à 16:24:37 UTC sans être annulée ; la limite d’accès reste pertinente pour
les diagnostics opérateur et les essais live futurs.

## Dépendances externes et travaux reportables

Pour lever les réserves : accès réseau aux deux domaines, compte QA isolé,
lecture opérateur du cluster/manifeste, prestataires mail/OAuth/IA configurés,
Stripe en mode test pour le parcours financier, environnement de restauration
autorisé et appareil Safari réel. Créer un runtime ou un restore facturé et
déclencher un paiement réel exigent un accord précis ; aucune de ces actions
n'a été effectuée.

Accès concret requis pour reprendre les essais :

- Un environnement de navigateur autorisé à joindre en HTTPS `e-code.ai`,
  `app.e-code.ai` et `api.e-code.ai`, puis les hôtes de preview/publication
  réellement retournés par l'application, avec WebSocket/WSS. Le proxy de ce
  workspace refuse actuellement la connexion aux trois premiers hôtes avant
  toute réponse de l'origine. Aucun accès par IP, proxy alternatif ou autre
  contournement de ce refus n'est utilisé.
- Une identité QA dédiée, une boîte de réception de test pour la vérification
  d'inscription, une organisation sans données client et une seconde identité
  dans une organisation distincte pour les essais d'isolation. Les identifiants
  et sessions doivent être fournis par le mécanisme sécurisé de l'environnement,
  jamais dans le chat ou les preuves commitées. Un compte préexistant ne prouve
  pas à lui seul que l'inscription neuve fonctionne.
- Un plafond de dépenses et une autorisation explicite avant tout appel IA,
  workspace ou restauration facturé ; Stripe doit être en mode test pour les
  essais de souscription et de webhooks. Aucun abonnement client ne sert de
  support à ces essais.
- Pour l'exploitation, accès en lecture aux logs Cloud Build, au manifeste de
  release et aux imageIDs du cluster `vibecore-prod-app` du projet
  `vibecore-495216`. L'exercice de restauration nécessite un périmètre séparé
  explicitement autorisé ; une lecture opérateur seule ne l'autorise pas.

L'intégration de ce bilan n'exige aucune livraison applicative : tous ses
fichiers correspondent aux filtres `**/*.md` ou `docs/**` de
`.github/workflows/deploy-main.yml`. Aucun dispatch manuel de déploiement ne
doit être lancé pour cette seule PR documentaire. Les contrôles de fusion
habituels restent requis.

Peuvent être reportés **si exclus de l'offre annoncée** : applications natives
et desktop, SSO Enterprise, connecteurs secondaires, parité exhaustive des
panneaux et optimisations supplémentaires de CI. L'inscription, le parcours
agent/publication, la conservation des données et la justesse des débits
restent des conditions de lancement.

Aucune estimation globale défendable avec ces accès manquants. La mesure de
collisions exige une fenêtre d'au moins 24 heures après livraison ; les temps
de restauration sont des objectifs documentaires tant qu'aucun exercice réel
ne les a mesurés. Aucun pourcentage de complétude n'est déduit des tests.

Deux captures historiques de #732 ont été inspectées :
`docs/reprise/captures/pastille-preview-2026-10-13/preview-loading-390.png`
(squelette et attente visibles, pas une application chargée) et
`agent-return-390.png` (fil de test et composeur visibles). Elles illustrent
le banc du 13 octobre, pas la production du 18 octobre ni Safari physique.

### Actualisation du 18 octobre à 19:36 UTC : fusion #735 bloquée

Le [verdict E2E](https://github.com/openaxcloud/vibecore/actions/runs/39154310039/job/117768608241)
est **rouge** sur la tête `1d2755086f5d05d41c1d12739dcfd230a1a99044` :
453 tests rapportés, trois échecs persistants, neuf instabilités et six
exemptions existantes. Les 73 fichiers attendus figurent dans les rapports.
Les trois échecs, encore présents après deux réessais, concernent le tour
streamé mobile sans message ajouté, le titre du panneau Base de données absent
et sa première carte absente. Leur cause et leur lien éventuel avec #735 ne
sont pas encore établis. Aucune exemption ni aucun seuil n'a été modifié.

Les sorties standard et d'erreur sont entrelacées dans le journal : quatre
tests instables apparaissent après le titre des échecs non exemptés. Le code
de la porte accepte les résultats `flaky` et calcule bien **trois**, pas sept,
échecs persistants. Les jobs de tranche verts ne suffisent pas : ils laissent
le verdict central juger leurs rapports. [Mesure détaillée](mesures/2026-10-18-pr735-e2e-failure.json).

L'audit français, y compris la tablette réellement rejouée, est vert depuis
19:01:44 UTC. Cela ne lève pas le blocage E2E. **#735 n'est ni fusionnée ni
déployée** ; aucune ligne de fusion n'est ajoutée au journal pour cette PR.

### Actualisation à 19:48 UTC : contre-épreuves locales et PR indépendante

Les trois tests E2E concernés passent sur le build officiel du SHA exact de
#735, sans réessai : **3/3 en 57,2 s**. Les mêmes tests étaient également
verts sur main après #733 (12,4 s, 9,7 s, 9,7 s). La reproduction locale emploie
Node 24, Chromium 154 et PostgreSQL 16.15, sans Redis ni manager cloud ; elle
ne reproduit donc pas toute la pile ni l'ordre de la tranche CI. Le streaming
est la fixture instrumentée du test existant, pas une génération de modèle.
La cause du premier verdict rouge reste inconnue. Une seule relance ciblée
de sa tranche, même code et mêmes règles, a commencé à 19:43:56 UTC : job
`117771399663`, tentative 2 du run `39154310039`. Aucun résultat de cette
relance n'est encore revendiqué. [Contre-épreuves](mesures/2026-10-18-pr735-local-e2e.json).

Sur l'API et PostgreSQL locaux, deux organisations QA distinctes donnent
**huit lectures propriétaire HTTP 200 et huit lectures croisées HTTP 404**
(projet, fichiers, variables, secrets, bases, état IDE, workspaces, snapshots).
L'écriture croisée de l'état IDE rend 404 ; la relecture propriétaire confirme
son état intact. La lecture anonyme rend 401. Aucun workspace, paiement ni
service cloud n'est provisionné. Cette mesure ne prouve pas l'isolation des
pods, PVC, réseaux ou de la production. [Preuve locale](mesures/2026-10-18-local-isolation.json).

La [PR #736](https://github.com/openaxcloud/vibecore/pull/736), tête
`646ad466ae6c523dbfab4dda974f0f9478a9d53c`, est indépendante de #735 et fondée
sur main `44a8e01bc`. Elle retire les métriques/statuts fictifs des neuf API
publiques, annonce une télémétrie indisponible et ferme l'entrée statique
héritée sans modifier ses assets dérivés. Elle n'est ni fusionnée ni déployée.
146 tests avant rebase et 103 après réussissent ; build/typecheck/i18n et
captures précèdent le rebase, avec 19 fichiers source/tests identiques et
patch workflow identique. La CI du commit final reste requise. Contre-revue
indépendante sans P0/P1 restant dans ce périmètre.

Captures du serveur local inspectées : [bureau EN](captures/statut-public-2026-10-18/en-1440.png),
[téléphone FR](captures/statut-public-2026-10-18/fr-390-viewport.png), et
[mesures des six pages EN/FR](captures/statut-public-2026-10-18/evidence.json).
Le formulaire a été ouvert sans être envoyé. Aucun de ces fichiers n'est
une capture de production ou une preuve Safari ; l'ancien cache d'une heure
n'est pas purgé et l'edge Cloudflare reste non vérifié.
