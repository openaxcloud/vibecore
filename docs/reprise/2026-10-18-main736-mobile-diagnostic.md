# Échec mobile de main après #736 — 18 octobre 2026

Le [verdict E2E du commit `b827b12255`](https://github.com/openaxcloud/vibecore/actions/runs/39165426875/job/117794779887)
échoue à 21:28:07 UTC : 453 tests rapportés, un échec persistant, cinq
instabilités, six exemptions inchangées et 73/73 fichiers. Aucune relance
identique n'est demandée. La livraison de ce commit a été refusée à
21:35:38 UTC par sa barrière, avant build et rollout.

Le cas `ide-mobile-chrome.spec.ts:3377` échoue trois fois au contrôle du
titre « All databases / Toutes les bases de données » en ligne 3395, alors
que l'onglet Base de données est déjà actif. Le diagnostic observe
`mobilePanel="deploy"`, `databaseTabActive=true`, zéro carte, zéro table,
`responses=[]` et les quatre indicateurs DB à false. Ces données sont
insuffisantes pour attribuer la cause à la synchronisation mobile ou à
une lenteur réseau.

## Ce que le code permet de conclure

- `deploy` est le conteneur voulu pour les outils de gestion mobiles :
  [contrat et résolution du panneau](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/chat/BaseChat.tsx#L3522),
  [ouverture de l'outil](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/chat/BaseChat.tsx#L6365)
  et [rendu mobile](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/chat/BaseChat.tsx#L10448).
  Cette valeur n'est donc pas, à elle seule, une désynchronisation.
- Le wrapper lance son chargement puis affiche `PanelLoading` pendant
  `busy && !payload`. Le titre du `DatabaseWorkbench` n'est alors pas
  présent : [requête](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/chat/BaseChat.tsx#L11742),
  [chargement extérieur](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/chat/BaseChat.tsx#L12096).
- Les quatre indicateurs DB du helper utilisent ce titre comme point de
  départ. Ils deviennent donc tous false si le titre manque, même si le
  conteneur ou le squelette est présent. Le comptage global `statuses=2`
  ne résout rien : [PanelLoading](https://github.com/openaxcloud/vibecore/blob/b827b12255d423ffb96143c39c1d2a3917ffc5e2/app/components/ui/PanelBoundary.tsx#L224)
  possède `aria-busy` et `aria-live`, mais pas `role=status`.
- `responses[]` observe seulement les réponses du navigateur. Il ne suit
  ni le début ni l'échec des requêtes, ni les appels serveur du loader, ni
  le `request.put` de préparation du test. Vide, il ne distingue pas une
  requête absente d'une requête encore en attente.
- Le wrapper et le `DatabaseWorkbench` chargé effectuent chacun une lecture
  du panneau. Cette duplication est visible dans le code, mais son rôle
  causal dans l'échec CI n'est pas démontré.

La [contre-expérience locale sur une vraie réponse HTTP](mesures/2026-10-18-database-panel-delivery-gate.json)
avait exactement l'état onglet actif/conteneur `deploy`/titre absent pendant
la rétention volontaire de la réponse, avec le conteneur visible et
`aria-busy=true`. Après libération, le titre et les 128 tables du PostgreSQL
QA apparaissaient. Le retard était imposé : ce n'est pas une mesure de
lenteur CI ni une reproduction de sa cause.

## Pièce manquante et suite bornée

Le rapport de la tranche 1 est l'artefact GitHub `12150884675`, 80 579 545
octets. Le connecteur fournit bien sa référence de fichier, mais sa
matérialisation normale échoue au proxy avec `CONNECT 403`. La capture CI
actuelle n'a donc pas été inspectée. Aucun proxy ni contrôle n'a été contourné.

Le [candidat de diagnostic publié](https://github.com/openaxcloud/vibecore/tree/codex/ide-failure-diagnostics-20261018),
commit `a78c77665665354f9d9ffd31edeafb56ab811544` sur `c4211323`, observe le conteneur DB
indépendamment du titre, son état `aria-busy`, le début et la fin des
requêtes ainsi que les échecs et les demandes encore pendantes, sans URL,
contenu, identifiant projet ni secret. Aucune assertion, durée maximale,
tentative ou exemption n'est assouplie. Un résultat vert ultérieur ne
sera pas présenté comme une correction de cette cause encore inconnue.

[Validation de cette branche](mesures/2026-10-18-mobile-db-diagnostic-candidate.json) :
les deux contre-exemples sont rouges avant correction, puis 18 tests du
collecteur et 16 tests d’index passent. Typage strict, émission JavaScript et
lint ciblés réussis ; 45 scénarios Playwright chargés via `--list`, non exécutés.
Chromium et un vrai serveur HTTP loopback confirment attente des headers,
corps partiel, fin et annulation, avec un DOM de fixture : cette preuve porte
sur le helper isolé. Gitleaks staged et arbre exporté propres, règles
existantes inchangées. Au relevé initial, #738 et #739 occupaient les deux
créneaux. #739 documentaire est depuis fusionnée à 22:32:21 UTC.
Cause du défaut produit toujours inconnue.

## Éléments suivants — 22:07 UTC

L’E2E de main après #737 échoue sur une autre surface (palette d’ajout
d’onglet) ; ses deux cas DB passent au premier essai. La tête `bee26fd28`
de #738 échoue à nouveau sur le titre DB absent lors des trois tentatives,
à 22:04:57 UTC. Aucun de ces résultats n’établit la cause DB.

Le workflow instrumenté [39170180476](https://github.com/openaxcloud/vibecore/actions/runs/39170180476),
sur la tête exacte `a78c7766`, exécute depuis 21:58:37 UTC le fichier mobile
sur chacun des quatre jobs existants. Les observations supplémentaires
permettront de distinguer conteneur absent, chargement actif, requête
pendante/annulée et réponse reçue. Il termine à 22:11:43 UTC avec
45 cas uniques, zéro échec persistant et une instabilité. Les deux cas DB
passent au premier essai dans chacun des quatre jobs ; aucune métadonnée
d’échec DB n’est recueillie. Les six exemptions configurées ne correspondent
à aucun cas de ce rapport ciblé. [Résultat](mesures/2026-10-18-mobile-db-diagnostic-targeted-result.json).

Le [run complet instrumenté 39171191591](https://github.com/openaxcloud/vibecore/actions/runs/39171191591),
sur le même SHA et avec l’ordre complet original, termine à 22:30:58 UTC :
453 rapportés, zéro échec persistant, deux instabilités, six exemptions
inchangées et 73/73 fichiers. Les deux cas DB passent au premier essai.
[Résultat complet](mesures/2026-10-18-mobile-db-diagnostic-full-result.json).
La cause reste inconnue ; ces runs précèdent les correctifs UI.
Les deux [défauts locaux reproduits et corrigés](2026-10-18-ide-recovery-defects.md)
ne sont pas présentés comme une attribution des échecs CI.

Un défaut distinct de perte de palette au remplacement de la coque a été
[reproduit localement et capturé](mesures/2026-10-18-palette-handoff-local.json).
L’attribution à l’échec CI de palette reste inconnue ; ce mécanisme n’est
pas présenté comme la cause DB.
