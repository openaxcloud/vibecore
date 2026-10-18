# Vérification avant commercialisation — 18 octobre 2026

**Décision : lancement commercial complet non validé.** Ce verdict exprime
des défauts de code reproduits et des preuves indispensables manquantes, pas
une affirmation que tous les parcours échouent en production.

Mise à jour finale : [#733](https://github.com/openaxcloud/vibecore/pull/733)
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

## État actuel et accès

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

## Blocages et inconnues actuels

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
