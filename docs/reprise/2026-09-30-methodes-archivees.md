# Mesures et décisions historiques du lot documentaire

Archive des ajouts de `docs/lot-documentaire` à `CLAUDE.md`. Ces observations restent datées ; elles ne remplacent pas la consigne du 11 octobre de limiter à deux propositions actives et de vérifier chaque livraison. La copie ci-dessous préserve les mesures sans remplacer les instructions actuelles.

## Fusionner : UNE À LA FOIS, et on attend que ça atterrisse

**Deux fusions rapprochées se détruisent l'une l'autre.** GitHub ne garde qu'**un
seul run EN ATTENTE par groupe de concurrence**. Le déploiement de la première
fusion patiente ; la seconde fusion arrive, l'écarte, et repart de zéro. Trois
fusions de plus et plus rien n'atterrit jamais.

⚠️ **`cancel-in-progress: false` ne protège pas de ça** — et c'est le piège :
le réglage est déjà bon, on croit donc être couvert. Il protège un déploiement
qui TOURNE. Il ne protège pas celui qui ATTEND son tour, et quand les coureurs
sont saturés, tous attendent.

**Mesuré le 2026-09-30, et ça a coûté cinq heures.** Sept correctifs fusionnés
dans la matinée, dont le défaut bloquant qui faisait perdre un client au moment
de l'inscription. **Cinq déploiements annulés d'affilée** — 09:27, 09:37, 10:05,
10:10, 10:14 — chacun avec **zéro job exécuté** : ils n'ont jamais démarré. À
midi, la production servait encore le code de la veille.

**La règle :**

1. On fusionne **une** proposition.
2. On **attend que son déploiement soit SERVI** — vérifié par les trois niveaux :
   ce que Helm demande, l'empreinte épinglée sur les pods, et le registre qui
   confirme que le tag porte bien cette empreinte.
3. **Ensuite seulement** la suivante.

Ce n'est pas plus lent. Le 2026-09-30, fusionner en rafale a livré **zéro**
correctif en cinq heures.

### Le lot de trois — décision d'Avi du 2026-09-30, après mesure

**On fusionne par LOTS DE TROIS, pas une à la fois.** Le chiffre qui a tranché :

    pipeline seul, file vide, la nuit          37 min
    en journée, file chargée          1 h 09 à 2 h 51

**Le pipeline ne fait que 37 minutes ; tout le reste est de l'attente de file.**
Sérialiser à l'unité plafonnait donc à **quatre livraisons par jour ouvré**, ce
qui est intenable avec une dizaine de correctifs prouvés en attente. Le lot garde
ce qui protégeait — **un seul déploiement en vol** — et triple le débit.

**Quatre conditions, non négociables :**

1. **Seuls des correctifs DÉJÀ VERTS** entrent dans un lot. Jamais un « corrigé
   en local », jamais un « ça devrait passer ».
2. **Pas deux correctifs touchant la même zone** dans le même lot — sinon un
   retour arrière ne dira pas lequel était fautif, et on aura échangé du débit
   contre de l'aveuglement.
3. **Trois au maximum.**
4. **Ce qui touche la chaîne de livraison elle-même part SEUL** : workflows de
   déploiement, configuration de test, portes. Un lot qui casse la chaîne qu'on
   utilise pour le corriger n'a plus de sortie de secours.

Le prix du lot, énoncé pour qu'il soit choisi et non subi : **un correctif
fautif emmène les deux autres au rollback.** C'est acceptable parce que les trois
sont verts avant d'entrer ; ça ne le serait pas autrement.

### On n'attend QUE pour un déploiement qui compte encore

**Précision d'Avi du 2026-09-30, après un cas réel.** La règle « ne pas fusionner
tant qu'un déploiement est en vol » ne vaut que pour un déploiement **qui porte
la tête de `main`**. Un déploiement **déjà dépassé par un autre** ne mérite
aucune attente : il sera écarté de toute façon, et le retenir ne protège rien.

Le cas : le déploiement de 14:22 attendait depuis 1 h 27, bloqué sur la porte de
release ; celui de 15:46 l'avait déjà dépassé. Retenir #613 pour lui, c'était
laisser en place **la cause même du blocage** — #613 ramenait la suite E2E de
81 à 45 min — au nom d'une victime déjà perdue.

**Le contrôle, avant de renoncer à fusionner :**

```
gh run list -R openaxcloud/vibecore --workflow deploy-main.yml --limit 2 \
  --json status,conclusion,headSha,createdAt
git rev-parse --short=10 origin/main
```

Si le `headSha` du déploiement en vol **n'est pas** la tête de `main`, il est
déjà dépassé : on fusionne.

⚠️ **Et le vrai goulot n'est pas la file de déploiement, c'est l'E2E.** Le
déploiement s'arrête sur « Release gate — required checks green for THIS
commit », qui attend `Production E2E` sur le même commit. Le pipeline seul fait
37 min ; c'est l'E2E devant lui qui fait les heures.

**Le contrôle, avant de fusionner** — un déploiement est-il déjà en vol ?

```
gh run list -R openaxcloud/vibecore --workflow deploy-main.yml --limit 3 \
  --json status,conclusion,headSha,createdAt
```

S'il y en a un en `queued` ou `in_progress`, **on ne fusionne pas**. On attend.

⚠️ **Corollaire mesuré le même jour** : un déploiement qui prend enfin son tour
déploie **SON** commit, pas la tête de `main`. La production peut donc servir un
code ANTÉRIEUR à ce qui attendait. Le 30/09 à 12:15, le servi était
`90e902533b` (11:55) alors que `a24429442b` (13:14) patientait — quatre
correctifs sur cinq n'étaient pas en production alors qu'on les croyait livrés.
**Vérifier le CONTENU du SHA servi, jamais le numéro seul** :
`git merge-base --is-ancestor <commit-de-fusion> <sha-servi>`.

### JAMAIS une proposition DOCUMENTAIRE juste après du code

**C'est la plus traître des quatre, parce que personne n'y est pour rien.** Les
trois règles ci-dessus disent quand attendre. Celle-ci dit ce qu'il ne faut
jamais mettre en deuxième position.

Un commit documentaire est filtré par `paths-ignore` : son déploiement ne part
pas. Mais il avance quand même `main`, et **avancer `main` écarte le
déploiement en attente**. Enchaîné juste après une fusion de code, il produit
donc exactement ce qu'il faut pour perdre une livraison :

1. le code est fusionné ; son déploiement prend sa place dans la file ;
2. le commit documentaire arrive et **écarte** ce déploiement ;
3. `paths-ignore` fait **sauter** le sien.

Résultat : **plus aucun déploiement ne porte le code**, et rien n'alerte. Pas
de rouge, pas de run annulé à lire, pas de message. La production sert le code
d'avant et la proposition est marquée « fusionnée ».

Le piège est double : un commit documentaire paraît **inoffensif**, donc c'est
précisément celui qu'on enchaîne sans réfléchir quand on veut « profiter » de
l'attente.

**La règle :**

* une proposition documentaire part **seule**, ou **en dernier après que le
  déploiement du code a été SERVI** — vérifié par les trois niveaux, pas par
  son numéro ;
* si elle est déjà passée dans le mauvais ordre, **il n'y a rien à corriger
  côté dépôt** : le code est bien sur `main`, c'est le déploiement qui manque.
  On le relance à la main, c'est le seul chemin —
  `gh workflow run deploy-main.yml -R openaxcloud/vibecore --ref main`
  (`workflow_dispatch` ignore `paths-ignore`, c'est justement pour ça) ;
* et **le contrôle qui l'attrape après coup**, en une commande : le dernier
  déploiement `success` porte-t-il le commit de fusion du code ?
  `git merge-base --is-ancestor <commit-de-fusion> <sha-servi>`. Un `non` sur
  une proposition fusionnée depuis longtemps, c'est ce cas-là.

⚠️ **Et ça ne se limite pas aux `docs(...)`.** Tout commit dont les chemins
tombent entièrement sous `paths-ignore` a le même effet : un `.md`, un fichier
de suivi, un `.gitignore`. Le déclencheur n'est pas le préfixe du message,
c'est **l'ensemble des chemins touchés** — le vérifier avant, pas après.
### UN TEST NE PART SUR `main` QU'AVEC LE CODE QU'IL VALIDE

Jamais avant. Un test qui arrive seul ne mesure pas un défaut : il mesure une **absence**,
et il bloque tout le monde pour elle. La porte de release refuse, les déploiements
s'arrêtent, et chaque session qui fusionne ensuite hérite d'un rouge dont elle n'est pas
responsable — avec, au bout, un correctif « livré » qui n'a aucun effet parce que son
déploiement n'est jamais parti.

**Le geste :** le test et le code qu'il valide sont dans la **même** proposition. Si on veut
livrer le test d'abord pour montrer le défaut, il part avec `test.fail()` ou dans la
dérogation bornée — pas en rouge nu sur `main`.

⚠️ **CE N'ÉTAIT PAS LA CAUSE LE 2026-10-01, et la nuance vaut la règle.** Le soupçon était
fondé : `reouverture-ne-rejoue-pas.spec.ts` est arrivé sur `main` par #597, et son sujet —
« l'historique de l'agent n'écrase pas le travail de l'utilisateur » — est **exactement**
celui d'un correctif qui attendait encore dans la file (`fix/conflit-utilisateur-agent`).
Le raccourci tentant était d'en conclure « test livré avant son code, donc `main` rouge
depuis son arrivée ».

**La mesure a dit non.** Sur les quatorze derniers passages E2E de `main` : **vert dès le
premier passage après sa fusion, puis neuf verts et un seul rouge.** Ni « rouge depuis
l'arrivée », ni régression d'une fusion récente — il **flotte**, une fois sur dix.

**Et le vrai enseignement est là, pas dans la règle :**

> **Dans la famille « le travail de l'utilisateur est perdu », un test instable n'est pas
> du bruit de CI : c'est le défaut qui se montre une fois sur dix.**

Ce test affirme que rien n'est écrasé. Qu'il échoue parfois signifie qu'une fois sur dix,
en conditions de CI, **ça l'a été**. On ne le stabilise donc pas — on ferme la course qu'il
observe. C'est ce qui a fait passer `fix/conflit-utilisateur-agent` devant un correctif
d'inscription bloquant, et cet arbitrage ne se lisait pas dans le compteur de la porte :
il fallait regarder de quoi le test parlait.

Corollaire de la règle 17 : « un test qu'on croit déterministe et qui passe une fois sur
trois n'est pas un défaut produit » reste vrai — **sauf quand ce qu'il mesure est une perte
de données.** Là, chaque échec est une occurrence.


### « VERT À LA RELANCE » NE PROUVE PAS QUE LE TEST EST EN CAUSE

Un échec intermittent peut être un **défaut** intermittent. La relance ne départage pas les
deux : elle montre seulement que le défaut ne se produit pas à tous les coups.

**Vécu le 2026-10-01, et j'ai relayé la mauvaise conclusion.**
`reouverture-ne-rejoue-pas.spec.ts › première ouverture d'un projet : l'historique de
l'agent n'écrase pas le travail de l'utilisateur` échouait une fois sur dix sur `main`.
J'ai mesuré proprement — quatorze passages, neuf verts, un rouge, vert dès son arrivée,
vert à la relance — et j'ai écrit **« le test était instable »**. C'est cette phrase qui a
été transmise.

**C'était faux.** Ce n'était pas un test qui flotte, c'était la **perte de données
elle-même**, qui se produisait une fois sur dix. Le correctif #667 (priorité de la
sauvegarde utilisateur, fusion à trois voies) l'a corrigée. Le test disait la vérité à
chaque échec.

**La méthode était bonne, la conclusion ne l'était pas** — et c'est ce qui rend l'erreur
instructive : mesurer beaucoup ne protège pas d'interpréter mal. Les quatorze passages
établissaient « ça échoue une fois sur dix » ; j'en ai tiré « donc le test est fautif »,
ce qui ne s'en déduit pas.

**Le geste, avant de dire « instable » :**

1. **Lire ce que le test AFFIRME**, pas seulement son compteur. S'il affirme qu'aucune
   donnée n'est perdue, chaque échec est une occurrence de perte — pas un faux positif.
2. **Chercher si un correctif en attente traite ce sujet.** Si oui, l'hypothèse « défaut
   intermittent » devient la plus probable, et le test devient son meilleur témoin.
3. **Ne jamais classer « instable » un test de la famille perte de données / corruption /
   fuite.** Dans ces familles, le coût d'un faux « instable » est un défaut livré ; le coût
   d'un faux « défaut » est une relance.
4. **Quand on dérogue, dire lequel des deux on croit.** La dérogation bornée est pour un
   test qui flotte, pas pour un défaut qu'on ne veut pas regarder.

⚠️ **Et la conséquence sur le compte rendu** : j'ai annoncé « instable » avant d'avoir
établi la cause, dans un message dont je savais qu'il serait relayé. Une hypothèse
transmise sans son incertitude devient un fait pour celui qui la reçoit. Le bon énoncé
était : « échoue une fois sur dix ; j'ignore encore si c'est le test ou le produit ».

Corollaire de la règle 17, qui disait l'inverse pour un autre cas : « un test qu'on croit
déterministe et qui passe une fois sur trois n'est pas un défaut produit » reste vrai pour
les tests d'interface et de rendu. Il ne vaut **pas** quand l'énoncé du test porte sur
l'intégrité des données de l'utilisateur.


### `paths-ignore` PASSE AVANT la détection de tiers — ne jamais estimer le coût d'un lot sans l'avoir mesuré

**Je me suis trompé là-dessus le 2026-10-01, par écrit, en gras, dans le fichier que lit
Avi.** J'avais annoncé que #637 reconstruirait **les quatre tiers** parce qu'elle touche
`.github/workflows/deploy-main.yml`, qui est bien dans le motif de base partagée. Son
déploiement est en réalité **entièrement sauté** : coût **zéro**, pas trois heures.

**Le mécanisme, dans l'ordre :**

1. **`paths-ignore`** décide s'il y a un déploiement **du tout**. Il saute quand **tous**
   les fichiers du commit matchent `**/*.md`, `docs/**`, `.github/**`, `tests/**`,
   `**/*.spec.{ts,tsx,mjs,js}` ou `playwright*.config.ts`.
2. **`Detect changed tiers`** décide seulement ensuite **lesquels** reconstruire — et c'est
   là que vit le motif de base partagée.

Vérifier (2) en oubliant (1) fait estimer trois heures pour un lot qui coûte zéro. Et
l'inverse est pire : un lot qu'on croit gratuit peut déployer pour **un seul** fichier non
ignoré — #661 déploie à cause du seul `scripts/e2e-gate.mjs`, au milieu de neuf fichiers
qui, eux, sont ignorés.

**Le geste :** ne jamais estimer, **mesurer** — `scripts/declenche-un-deploiement.mjs` lit
le `paths-ignore` du workflow et répond, et il **lève** si le motif a disparu plutôt que de
rendre « rien à ignorer ». Avec un **contrôle positif** dans la même commande : un fichier
de code produit doit rendre « DÉPLOIE », sinon c'est l'outil qui est muet, pas le lot qui
est gratuit.

**Et la conséquence qui compte vraiment :** un lot qui **saute** son déploiement n'est pas
gratuit, il est **dangereux**. Il avance `main`, donc il **écarte** le déploiement qui
attend dans le groupe de concurrence, puis ne déploie rien lui-même. Les lots qui sautent
ne se fusionnent que **file de déploiement vide**. C'est la règle d'au-dessus — celle-ci
dit juste comment savoir, sans se tromper, lesquels sautent.

