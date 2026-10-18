# Vérification avant commercialisation — 18 octobre 2026

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

## Dernier état vérifié — 20:37 UTC

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
préexistants, six exemptions inchangées et 73/73 fichiers. Le déploiement a
franchi la porte du SHA exact et passe ses contrôles préalables ; aucun
rollout ni ConfigMap live n'est encore attesté.
**V2 reste désactivé** : cette fusion n'autorise pas son activation. La dernière
livraison réussie attestée reste #733. Aucun nouveau parcours en production
n'est prouvé.

[#736](https://github.com/openaxcloud/vibecore/pull/736), tête `c4300e60dd`,
a été rebasée sur le commit fusionné de #735 ; aucun conflit restant. Ses
contrôles sont en cours. Sur l'ancienne tête `646ad466ae`, CI et audit EN/FR
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

Le correctif runtime `6f766f76e`, rebasé sur `c6439da` et encore local sans PR, refuse désormais
une création/restauration d'instantané sans archive au lieu d'annoncer un
succès sans fichiers restaurés. Ses validations après rebase passent : API 27/27, agent 121/121,
index 6/6, typecheck API complet et aucun diagnostic lint ajouté. Il ne fournit pas une sauvegarde durable : la restauration DB et
la convergence du Pod restent à établir ; des défauts distincts de contrat
ont été relevés sur ces chemins. Aucune restauration cloud n'a été exécutée.

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

Les relevés suivants conservent leur date et ne remplacent pas cet état.

## Les cinq conditions de lancement — reprise à 19:13 UTC

Cette liste reste le critère de sortie. La correction de ressources #733 et
la livraison préparatoire proposée dans #735 n'y substituent pas un verdict CI.
À ce relevé, main est `44a8e01bc1` ; la dernière livraison réussie reste
`615b3fcfb5`. #735, tête `1d2755086`, n'est ni fusionnée ni déployée.

| Condition indispensable | Code, tests et intégration établis | Preuve de clôture encore nécessaire |
| --- | --- | --- |
| Compte neuf → génération → exécution → sauvegarde → publication → URL utilisée | Parcours et composants présents. Le [tri des 18 échecs runtime](2026-10-18-runtime-triage.md) relève 7 dérives d'assertion vérifiées, 4 attentes de runtime sur un banc sans runtime, 5 parcours mobiles et 2 défauts d'interface encore non attribués. Aucun succès runtime. | Compte QA neuf et boîte mail autorisés ; génération réelle avec budget explicite ; état réel du serveur et de l'agent ; écriture puis réouverture ; URL publiée utilisée depuis une session extérieure. |
| Démarrage conforme au forfait | #733 fusionnée et livrée ; contrat local/API des forfaits historiques couvert. #735 ajoute admission coordonnée et barrières de suppression ; CI de sa tête : 2 418 tests API passés, 23 sauts ; 152 tests manager passés. Dernière tranche E2E encore en cours. | CPU/RAM/stockage effectivement attribués et quota concurrent observés dans le cluster. Inventaire et réconciliation des lignes legacy, drainage et essais live avant activation V2. Les nouveaux noms de forfait demandent une migration coordonnée. |
| Paiements et catalogue Stripe mensuel/annuel, droits après paiement | Routes, catalogue et tests isolés présents ; le workflow navigateur porte explicitement des billing mock flows. Aucun paiement réel ou de test Stripe effectué ici. | Inventaire autorisé du catalogue et des abonnements existants ; Stripe TEST, mensuel/annuel, webhook signé et idempotent, droits après confirmation, refus/annulation et changement de formule. Aucun paiement ni changement client sans accord précis. |
| Isolation, quotas, suppression, restauration réelle | Tests locaux d'admission et suppression conservant les références en cas d'incertitude. #718/#414/#79/#52 restent brouillons non intégrés. Le dry-run de sauvegarde local porte sur quatre fichiers temporaires. | Deux organisations QA distinctes ; refus croisés API/jetons/réseau/GCS/PVC ; dépassement de quota ; suppression et retry contrôlés ; restauration PostgreSQL/GCS/PVC isolée, intégrité et temps mesurés. |
| Mobile et Safari | #735 : audit EN/FR sur 390/768/1024/1440 vert ; tablette réellement relancée et réussie à 19:01:37 UTC. Canari WebKit vert. Les nouvelles captures ne sont pas inspectées ici, leur transfert local restant refusé. | Parcours critique authentifié sur petits écrans et Safari HTTPS, idéalement appareil physique, avec captures inspectées ; clavier, navigation, reconnexion, sauvegarde et publication. Chromium avec profil iPhone ne vaut pas Safari. |

Les [comptages CI de #735](mesures/2026-10-18-pr735-ci-counts.json) proviennent
du journal complet du job, désormais lisible par le connecteur GitHub. Ils ne
s'ajoutent pas aux tests locaux qui les recoupent. Les quatre audits EN/FR
utilisent une pile CI locale ; leur succès ne prouve pas la production.

Accès restant bloquant : HTTPS des domaines publics refusé par le proxy
(`CONNECT 403`, aucun code HTTP origine), pas d'accès opérateur GCP/Kubernetes,
pas de comptes QA/mailbox ni Stripe utilisables ici. Les logs du job de livraison
#733 restent illisibles (`Transport closed`) ; les captures référencées par
GitHub ne peuvent pas être copiées localement (`CONNECT 403`). Ces refus ne
prouvent aucune panne des domaines. Aucune tentative de contournement effectuée.

Une nouvelle anomalie de code est vérifiée : les loaders `api.status.*` et
`api.polyglot.health/benchmark` retournent des états sains, latences et uptime
constants sans télémétrie ; la page `/status` présente aussi tous les services
opérationnels et un historique vide comme calme. Son exposition effective live
n'est pas vérifiée. Une correction indépendante est en préparation ; elle
n'est pas fusionnée ni livrée. Le lancement exige des états inconnus honnêtes
lorsqu'aucune mesure n'existe, puis une vraie source d'exploitation.

À reporter seulement si exclus explicitement de l'offre : natif/desktop,
SSO Enterprise, connecteurs secondaires, parité visuelle exhaustive et
optimisation de durée CI. Les cinq conditions ci-dessus ne sont pas reportables
dans une déclaration de lancement complet. Aucun délai global fiable n'est
annoncé : les accès, les résultats live et les dépendances Stripe/restauration
ne sont pas encore établis ; la mesure de collisions sur 24 h reste une durée
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
