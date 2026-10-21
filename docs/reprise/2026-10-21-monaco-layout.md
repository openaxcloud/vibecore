# Reprise indépendante Monaco et layout — 21 octobre 2026

Base vérifiée : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f` (#745).
Branche : `fix/monaco-layout-ci-20261021`. Aucune fusion ni livraison de ce lot.
La coordination demande une PR brouillon et une validation combinée avant fusion.

## Inventaire préservé

L'ancienne tâche `01a14f75-8ac6-76f6-bce1-77be8a32601b` a été lue sans mutation.
Son dernier résumé rapporte cinq checkouts, un commit local `8edd7e4d`, un push
Git non authentifié puis un transfert connecteur interrompu. GitHub répond
422 « No commit found » à ce SHA abrégé : publication non confirmée ; cela ne
prouve pas l'absence de blobs isolés. Aucun ancien checkout supposé présent,
aucun fichier ancien écrasé, aucune republication du lot Intégrations/Security/
commandes. Le nouveau checkout contient une authentification GitHub existante ;
aucun credential n'a été créé.

## Baseline réellement mesurée

Build production de main réussi, Node 22.23.3, pnpm 9.14.4. Variables et pile
locale dérivées de `e2e.yml` et de son action composite. `VITE_RUNTIME_MODE`
absent : WebContainer par défaut, pas de substitution remote-kubernetes.
PostgreSQL/Redis/Mailpit isolés dans le projet Compose `vibecore-monaco-layout` ;
102 migrations appliquées. Aucun appel IA et aucune clé fournisseur disponible.
Le premier contrôle global a révélé une installation sauvegardée plus ancienne
que le lockfile : trois liens workspace racine manquants et shell-quote 1.8.4
au lieu de 1.11.0. Les versions de React, Monaco et Playwright étaient inchangées.
`pnpm install --frozen-lockfile` a réparé cet écart sans modifier le lockfile ;
le lock installé est maintenant identique octet par octet. Les résultats de
baseline ci-dessous précèdent cette remise en conformité ; les validations du
candidat la suivent.

Limite explicite : le téléchargement du Chromium Playwright 147 est refusé
HTTP403 par le proxy, y compris après demande d'escalade. Le diagnostic utilise
Chromium système 154.0.8037.57. Configuration Playwright du dépôt, délais,
assertions, retries et exemptions inchangés ; seuls executablePath et trace=on
sont réglés dans une configuration extérieure. Ce n'est pas une reproduction
bit à bit du navigateur CI.

Deux fichiers E2E complets : 4 cas, **2 échecs persistants, 1 flaky, 1 succès**,
549,9 s. Les deux échecs persistent sur les trois tentatives. Le cas mobile
768 px réussit ; le 390 px réussit au retry. Aucun de ces succès n'est une
certification de panneau.

- `ide-floating-file-tabs` : trois absences de Monaco à la ligne 63, avant les
  gestes flottants. Les fichiers et README sélectionné sont visibles.
- Retry 1 : attente du README à t=45926 ms ; archive demandée à t=47084 ms,
  terminée environ 1966 ms plus tard ; import Monaco seulement à t=49744 ms,
  téléchargement environ 610 ms. L'import est en série après les fichiers,
  alors que les contrôles unitaires de modèles passent.
- Viewport : deux tentatives atteignent le changement de langue puis échouent
  au retour de navigation (ligne 185) ; la troisième échoue au retour français
  (ligne 181). `ide-state` conserve `audit.txt` et le panneau flottant dans la
  première tentative. Pas de preuve de perte physique de fichiers.

Les anciennes archives GitHub restent inaccessibles depuis l'exécuteur (403).
Le connecteur a produit la référence `file_00000000ddd481f5a7079c2b3669484b`,
mais son téléchargement vers l'exécuteur est également refusé.

## Candidat et preuves locales

Monaco est préchargé dès le montage d'un shell IDE desktop, en parallèle de
l'archive et de la restauration. Le widget reste responsable de ses modèles ;
les pages hors IDE et les formats CodeMirror ne déclenchent pas ce préchargement.
Le second timer de sauvegarde du layout est retiré ; la portée restaurée est
vérifiée avant de transmettre l'état à la mémoire locale et à son debounce réseau.

Le test de l'effet réel de sauvegarde donne deux rouges sur main puis des verts.
Le premier passage candidat donne 34 tests sauvegarde/sélection verts. Après
ajout du garde de portée, les 4 cas de l'effet et 2 cas de sélection passent.
Les 4 tests Monaco de main passent. Le premier candidat de préchargement a
échoué au test d'import retardé ; une promesse unique partagée par préchargement
et montage corrige cette différence, puis les 4 cas Monaco repassent au vert.
Les builds intermédiaires ont été interrompus explicitement pour cette retouche
et pour remettre les dépendances au niveau du lockfile. Le passage combiné final donne 54/54 tests verts (7 fichiers) ; le build final
et les hooks globaux restent en cours au moment de ce checkpoint. Aucun E2E candidat vert n'est encore revendiqué.

Preuves de cet environnement : `/workspace/monaco-layout-evidence/` :
`baseline-build.log`, `baseline-browser.json`, `baseline-browser/` (traces de
chaque tentative et captures), `baseline-trace-summary.txt`,
`layout-counterexample.log`, `layout-fixed-unit.log`,
`layout-and-preload-unit.log`, `checkpoint.txt`. Ces fichiers ne sont pas inclus
comme gros binaires dans Git ; leur disponibilité dépend de l'environnement.

Vingt panneaux sur trente et un restent sans recette d'action documentée selon
la passation. Aucun panneau entièrement certifié ; aucune validation globale de
la plateforme, aucun déploiement de ce lot.
