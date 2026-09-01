# Instructions projet

## Règles

### Méthode — dix-neuf règles tirées d'erreurs réelles

Chacune vient d'une faute commise sur ce projet. Elles ne sont pas des principes
généraux : ce sont des pièges qui ont déjà coûté.

1. **Mesurer le chemin réel avant d'écrire une ligne de correctif.** Un correctif
   posé sur une route déduite de la lecture du code, sans avoir tracé le trajet
   de bout en bout, corrige un chemin que personne n'emprunte.
2. **Relancer le même commit avant d'accuser un changement.** Un test rouge sur
   votre commit et vert sur les précédents ne prouve rien. Une relance coûte
   quelques minutes ; un revert inutile coûte une journée.
3. **Distinguer « rien trouvé » de « rien exécuté ».** 50 runs `cancelled` ne
   disent rien sur le code. Un `grep` à zéro résultat peut être un motif mal
   échappé.
4. **Vérifier qu'une mesure a bien mesuré quelque chose.** Un corps tronqué à
   exactement 4000 octets, un cache d'outil, une fenêtre de lecture trop courte :
   tous rendent un « absent » qui n'en est pas un.
5. **Ancrer les tests sur du code, jamais sur de la prose.** Un test qui lit
   l'inventaire passe au vert quand on réécrit l'inventaire.
6. **Contre-épreuve dans les deux sens.** Retirer le correctif doit faire rougir.
   Retirer ce que le correctif protège doit faire rougir aussi. Sinon les deux
   moitiés ne sont pas couplées.
7. **Viser la règle, pas la première occurrence.** Trois symptômes du même
   mécanisme se corrigent une fois.
8. **Chercher s'il existe déjà une PR** avant d'en ouvrir une.
9. **Vérifier ce qu'un état de base déclenche avant de l'écrire.** Réconcilier
   196 lignes vers `STOPPED` arme une suppression de disques 24 h plus tard.
10. **Vérifier l'existence de ce qu'on croit protéger.** Un avertissement sur des
    disques qui n'existent pas est du bruit ; un correctif qui route vers un
    panneau vide ne corrige rien.
11. **Une mesure sans son environnement consigné n'est pas une mesure.** Noter le
    commit exact, l'état de l'arbre (propre ou non) et la commande complète.
    Sinon on ne peut ni la refaire ni la réfuter — et une conclusion bâtie
    dessus est à refaire.
12. **Ne jamais imprimer une VALEUR de secret, même filtrée.** La rédaction par
    sous-chaîne ne tient pas : sur les 49 clés du Secret de production, 25 sont
    sensibles et un filtre sur « SECRET » n'en masque que 14. Vérifier la
    PRÉSENCE et la LONGUEUR, ou comparer une empreinte `shasum`. Cela suffit à
    diagnostiquer une variable manquante ou tronquée.

13. **Ne jamais masquer la sortie d'erreur d'une commande de diagnostic.**
    `2>/dev/null` sur un diagnostic transforme un échec en résultat vide, et un
    résultat vide se lit comme une réponse. Mesuré : huit tentatives de rebase
    ont rendu « branche introuvable » alors que git disait
    `cannot lock ref 'refs/heads/tmp': 'refs/heads/tmp/102-rebase' exists` — le
    message était supprimé. Rediriger la sortie d'erreur est acceptable pour
    du bruit connu ; jamais pour la commande dont on lit le résultat.
14. **Vérifier qu'un « 0 résultat » vient d'une recherche qui a fonctionné.**
    Zéro n'est une information que si la recherche s'est exécutée sur la bonne
    cible avec le bon motif. Trois occurrences mesurées sur ce projet :
    `grep -rl '--vc-…'` où le motif a été pris pour des options ;
    `grep -c 'DEP_IMAGE="$(kubectl'` rendant 0 par artefact de quoting alors
    que `grep -F` en trouvait 1 ; et des corps tronqués à exactement 4000
    octets rendant un « marqueur absent » faux. Contrôle systématique : faire
    rendre au moins un résultat à la même commande sur un cas connu positif,
    ou utiliser `grep -F` avec le motif dans un fichier.

14 bis. **Un résultat NOYÉ trompe autant qu'un résultat absent.** La règle 14
    vise le « 0 résultat » ; celle-ci vise le résultat qu'on ne lit pas parce
    qu'il est enseveli. Mesuré le 2026-09-01 : une contre-épreuve dont la sortie
    portait 81 lignes de tests sautés n'a jamais affiché sa ligne `Tests` — le
    silence se lisait comme un succès. Même classe : une sortie tronquée, un
    `head -N` qui coupe avant l'information, des journaux `stdout` d'erreurs
    volontaires pris pour de vrais échecs. **Filtrer sur la ligne de verdict**,
    et vérifier qu'elle est bien apparue — l'absence de verdict n'est jamais un
    verdict.

12 bis. **INTERDICTION ABSOLUE — ne jamais lancer `printenv`, `env`, ni aucune
    commande listant les variables d'environnement dans un pod de production,
    même filtrée par un motif.** Deux fuites de clés de production dans un
    transcript ont suivi cette commande, la seconde après que la règle 12
    (« ne jamais imprimer une valeur de secret ») ait déjà été écrite : filtrer
    ne suffit pas, parce qu'on ne connaît pas d'avance ce que le filtre laissera
    passer.

    **Ce qui remplace ces commandes :**
    * pour savoir si une variable EXISTE — `kubectl get secret <nom> -o json`
      puis lire les **clés** de `.data` (jamais les valeurs), ou l'endpoint
      `/admin/providers/ai` qui rend `configured` / `length` / `last4` ;
    * pour comparer une valeur sans l'afficher — son empreinte :
      `… -o jsonpath='{.data.X}' | base64 -d | shasum -a 256` ;
    * pour le **SHA déployé** — le registre d'images ou les annotations du
      Deployment :
      `kubectl -n vibecore get deploy <nom> -o jsonpath='{.spec.template.spec.containers[0].image}'`,
      jamais une variable d'environnement.

    Cette règle n'a pas d'exception « juste pour vérifier ».

15. **Un correctif sans test qui le tienne est considéré comme NON LIVRÉ.**
    C'est la règle qui casse la boucle « corrigé → revenu → recorrigé ».
    Mesuré le 2026-09-01 sur les points de tête de l'analyse des recoupements :
    le code était déjà bon dans **six cas sur sept**. Le défaut dominant n'est
    plus la correction manquante, c'est la **garde manquante** — des correctifs
    justes, souvent documentés en commentaire, que rien n'empêche de défaire.

    Trois exemples du même jour :
    * `BUG-CREATE-004` — tout le correctif tient dans l'**ordre de deux
      branches `if`**. Un réordonnancement anodin le réintroduisait sans un
      seul test rouge.
    * `BUG-AGENT-005` — la garde ne cherche que `'<boltAction'` ; le cas
      `'<boltArtifact'` n'était couvert par **aucun** test.
    * `BUG-DEVSTART-…-001` — `#deferredStartArtifacts` n'apparaissait que
      dans son implémentation, et aucun spec ne contenait « Start application ».

    Un commentaire qui explique le piège ne protège personne : il se supprime
    aussi facilement que le code qu'il décrit. Seul un test rouge arrête un
    refactor.

16. **Fermer un point d'inventaire exige la RÉFÉRENCE DU TEST qui l'épingle**,
    pas seulement la preuve que ça marche aujourd'hui. Une preuve live date du
    jour où elle a été prise ; un test vaut pour tous les jours suivants.

    Format imposé dans la colonne Preuve : `preuve live … + épinglé par
    <chemin/du/test.spec.ts>`. Sans référence de test, le point reste ouvert —
    même si la vérification en réel est concluante.

    **Exception unique** : un point établi comme NON-DÉFAUT ou comme DOUBLON se
    ferme sans test, puisqu'il n'y a rien à tenir. Il doit alors le dire
    explicitement.

17. **Un test qui cesse d'être intermittent ne se diagnostique plus comme une
    course.** Tant qu'il passe au retry, l'hypothèse « race » tient. Le jour où
    il échoue sur TOUTES les tentatives, cette hypothèse est morte : soit le
    comportement a réellement changé, soit la course s'est élargie au point de
    ne plus se refermer. Continuer à le traiter en flake — le relancer, le
    tolérer — c'est laisser passer un vrai défaut.

    Vérifié le 2026-09-01 sur `agent-message-density.spec.ts` : `flaky (passed
    on retry): 1` pendant plusieurs runs, puis `failing: 1, flaky: 0`. Le
    compteur du garde-fou E2E distingue déjà les deux — il suffit de le lire.

    **Le corollaire vaut aussi** : un test qu'on croit déterministe et qui
    passe une fois sur trois n'est pas un défaut produit. Mesurer AVANT de
    conclure, dans les deux sens.

18. **Avant de faire un rollback, distinguer une MONTÉE EN CHARGE d'une
    défaillance.** Des `readyReplicas < replicas` juste après un déploiement ne
    prouvent rien à eux seuls. Trois signaux tranchent, et ils se lisent en
    trente secondes :

    - **l'âge des pods** — quelques secondes = ils démarrent ;
    - **le compteur de redémarrages** — `0` = rien ne plante ;
    - **l'état de l'HPA** — au-dessus de sa cible = il monte volontairement.

    Une sonde de disponibilité qui répond `connection refused` sur un pod de
    vingt secondes est NORMALE : le processus n'a pas encore ouvert son port.

    Vérifié le 2026-09-01 : `api 4/6` et `workspace-manager 8/10` après le
    déploiement de #329. HPA à **97 % de CPU** pour une cible de 70 %, pods de
    **18 secondes**, **0 redémarrage**, anciens pods tous prêts, `e-code.ai` en
    200. Trente secondes plus tard : **8/8**. Un rollback réflexe aurait annulé
    une livraison saine pendant que la plateforme absorbait sa charge.

19. **Une garde de sécurité qui bloque le travail normal se fait REVERT, pas
    corriger.** Le coût d'une garde ne se mesure pas à ce qu'elle interdit à un
    attaquant, mais à ce qu'elle interdit à un utilisateur légitime. Une garde
    correcte sur le plan sécurité et fausse sur le chemin nominal ne survit pas
    à sa première astreinte : elle est retirée en urgence, et le trou se
    rouvre — durablement, parce que « on a déjà essayé » devient l'argument.

    Donc : **toute garde ajoutée doit être accompagnée d'un test qui prouve
    qu'elle laisse passer le travail ordinaire**, au même titre que du test qui
    prouve qu'elle bloque l'attaque. Le cas nominal à tester en priorité est
    celui de la **ressource pas encore créée** — c'est là que les contrôles de
    confinement se trompent.

    Vérifié le 2026-09-01 (AUDX-001, PR #355) : la garde anti-symlink de
    `project-storage` remontait la chaîne des ancêtres **au-delà de la racine**.
    La racine d'un workspace secondaire étant créée paresseusement, elle
    n'existe pas à la première écriture ; la remontée atteignait alors le
    répertoire du projet — un ancêtre STRICT — dont le chemin relatif commence
    par `..` et **ressemble exactement à une évasion**. Résultat : toute
    première écriture dans un nouveau workspace était refusée. **5 tests métier
    existants sont tombés** et ont rattrapé la faute avant la revue. La boucle
    est désormais bornée à la racine, et un test dédié couvre le cas nominal.

    Corollaire : quand une suite existante tombe sur un correctif de sécurité,
    **la présomption va à la garde, pas aux tests**.

**Les règles 3, 4 et 19 visent le facteur d'erreur dominant.** Sur cette
campagne, mes commandes de mesure m'ont plus souvent trompé que le code
lui-même.


## Suivi (règle permanente)
Fichiers de suivi : `DESIGN_PROGRAM_MASTER.md` (points design — source de vérité unique ; specs détaillées dans `DESIGN_BATCH_*_SPEC.md`, état par point dans `DESIGN_AUDIT_LIVE.md`), `BUG_INVENTORY_LIVE.md` (bugs), `PLAN_REMAINING_UNIFIED.md` (plan), `REPLIT_PARITY.md` (parité Replit, fonctionnelle ET pixel).

**Design** — Dès qu'Avi donne des points « Claude design » (batchs A/B/C/D/E/F/G ou nouveaux), les ajouter IMMÉDIATEMENT dans `DESIGN_PROGRAM_MASTER.md`. La vérification d'un point design doit se faire EN RÉEL sur TOUTES les pages marketing ET user area, dans TOUS les formats web / tablette / mobile, en confirmant que la page s'adapte automatiquement au screen (responsive niveau Fortune-500). Un point design ne passe ✅ que si le responsive est validé sur les 3 formats.

**Bugs** — Dès qu'Avi envoie un bug, l'enregistrer IMMÉDIATEMENT dans `BUG_INVENTORY_LIVE.md`.

**Plan** — un point n'est ✅ que s'il est 100% surfacé ET marche en réel à 100%.

**Parité Replit** — suivi dans `REPLIT_PARITY.md` (parité fonctionnelle ET pixel). Un point n'y passe ✅ qu'après test réel live (à l'écran + greps) sur web / tablette / mobile — jamais sur « dispatché » ni « codé ».

**Garde obligatoire (règle 16)** — la colonne Preuve d'un point fermé doit
porter la **référence du test** qui l'épingle, en plus de la preuve live :
`preuve live … + épinglé par <chemin/du/test.spec.ts>`. Une preuve live vaut
pour le jour où elle a été prise ; un test vaut pour tous les jours suivants.
C'est ce qui empêche un défaut corrigé de revenir. Sans référence de test, le
point reste OUVERT même si la vérification en réel est concluante — seules
exceptions : un NON-DÉFAUT ou un DOUBLON établi, qui doit le dire explicitement.

**États** — chaque point des 4 fichiers de suivi (`DESIGN_PROGRAM_MASTER`, `BUG_INVENTORY_LIVE`, `PLAN_REMAINING_UNIFIED`, `REPLIT_PARITY`) trace **3 états séparés**, affichés côte à côte par point pour voir précisément où il en est :
- 📤 **Dispatché** — envoyé à une session
- 💻 **Codé** — commité + poussé sur `main`
- ✅ **Testé live** — vérifié à l'écran + greps, responsive web / tablette / mobile

Un point n'est « fait » QUE quand ✅ Testé live est coché ; 📤 Dispatché et 💻 Codé ne suffisent jamais.

**Règle commune** — Ne passer un point en ✅ QU'APRÈS test réel (vérif live à l'écran + greps de contrôle) — jamais sur « dispatché » ni « codé ». Quand Avi dit « fais-moi le point », TOUJOURS lire d'abord les 4 fichiers de suivi et dire précisément où ça en est.

## Déploiement prod (mécanisme réel)

**Runbook complet + commandes exactes : [`docs/DEPLOY_RUNBOOK.md`](docs/DEPLOY_RUNBOOK.md).** Vérité terrain reconstituée le 2026-07-07.

- **Auto** : chaque push sur `main` déclenche GitHub Actions **`.github/workflows/deploy-main.yml`** (repo `openaxcloud/vibecore` — ⚠️ `gh` pointe par défaut sur l'upstream `stackblitz-labs/bolt.diy`, toujours passer `-R openaxcloud/vibecore`). Il **build** via `gcloud builds submit --config=cloudbuild.yaml --region=europe-west9` (7 images taggées `git rev-parse --short=10` du SHA) puis **déploie** via `helm upgrade vibecore infra/helm/platform -n vibecore --reuse-values --atomic --timeout 10m --set services.<tier>.imageTag=<SHA>`.
- **Pas de GitOps** (ni Argo CD ni Flux). Release Helm **`vibecore`** / ns `vibecore` sur GKE `vibecore-prod-app` (europe-west9, projet `vibecore-495216`). Contexte kube : `connectgateway_vibecore-495216_europe-west9_vibecore-prod-app`. Ingress = ingress-nginx (LB `34.1.6.93`, DNS direct, pas de CDN).
- **Manuel** (ce que font les sessions) : `gh workflow run deploy-main.yml -R openaxcloud/vibecore -f short_sha=<sha>` OU build+helm à la main (voir runbook). ⚠️ `--reuse-values` fige `values-prod.yaml` (re-`--set` requis) mais applique bien les changements de **template**.
- **Rollback** : `helm -n vibecore rollback vibecore <REV>` (l'upgrade est `--atomic` → rollback auto si le rollout échoue).
- **Zéro-downtime** actif depuis `5c2c3586` (strategy maxUnavailable:0 + preStop, tous les Deployments).
