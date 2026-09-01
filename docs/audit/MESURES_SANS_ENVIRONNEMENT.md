# Mesures dont l'environnement n'a pas été consigné

Application rétroactive de la règle 11 : *une mesure sans son environnement
consigné n'est pas une mesure.* Relevé du 2026-09-01.

Une mesure est **utilisable** si on peut la refaire à l'identique : commit exact,
état de l'arbre, commande complète, et cible (production ? local ? quel SHA
déployé ?). Sinon elle ne peut être ni reproduite ni réfutée — et toute
conclusion bâtie dessus est à refaire.

---

## Déjà refaites et corrigées

| Conclusion d'origine | Ce que la contre-mesure a donné |
|---|---|
| « 3 tests échouent en suite complète, pas isolément » (31/08) | **Non reproductible.** 4 suites complètes dont 2 à ordre mélangé : 1844 passed / 0 failed. Et 1837 passed sur `0c22f0f1e`, soit *avant* le correctif. |
| « Le ramasse-miettes ne tourne pas, 0 évènement en 24 h » | **Faux.** `workspace.gc` termine toutes les 15 min dans BullMQ. La mesure regardait une table d'évènements, pas la file. |
| « Zéro PVC correspondant » (30/08) | **Faux.** 11 PVC `pvc-ws-*` vivants, dont un de 100 Gi. |
| « 196 espaces libérés peuvent réveiller une suppression de masse » | **Faux dans les deux sens.** Rien n'est éligible aujourd'hui (`WorkspaceRuntime` : 338 DELETED + 11 STOPPED, tous < 24 h). |
| « `BUG-SEO-TWITTER-DUP` est la cause de `BUG-CI-010` » | **Faux.** Le doublon est corrigé et prouvé live ; la cause était le shard `mobile-390`. |
| « `BUG-WORKER-001` : 4 jobs échouent à chaque déclenchement » | **Périmé.** `API_INTERNAL_URL` est présente ; dernier échec le 18/08. |

Six conclusions sur lesquelles j'avais bâti des priorités étaient fausses ou
périmées. Toutes venaient de mesures dont je n'avais pas consigné l'environnement.

---

## À refaire — mesures encore invoquées, environnement non consigné

### 1. `BUG-PERF-001` — l'amplification d'écritures ×40

**Chiffre invoqué** : « 1018 `PUT /files/write` pour 25 fichiers », daté du
15/08 (une mesure antérieure disait 750 PUT pour 20 fichiers).

**Ce qui manque** : le SHA déployé au moment de la mesure, le projet exercé, la
méthode de comptage (journaux du pod ? proxy ? sur quelle fenêtre ?).

**Pourquoi ça compte** : le chiffre sert à justifier une stratégie de correction
coûteuse. Deux correctifs d'archive ont été livrés depuis (#289, #292/#294) et
touchent le chemin d'écriture. Le ratio a pu changer dans un sens comme dans
l'autre.

**Protocole pour la refaire** : compter les `PUT /files/write` côté pod API sur
une génération réelle, fenêtre bornée aux horodatages de début et de fin de la
génération, en notant le SHA déployé, l'identifiant du projet et le nombre de
fichiers distincts finalement présents.

### 2. `BUG-IDE-013` — le volet bureau

**Conclusion invoquée aujourd'hui** : « sur bureau le panneau s'ouvre,
`ProjectBottomTerminal` est entièrement contrôlé ».

**Ce qui manque** : c'est une **lecture de code**, pas une mesure. Je ne l'ai
pas exercée à l'écran.

**Contradiction ouverte** : la PR **#191** s'intitule « `BUG-IDE-013` reste
ouvert — le correctif marche au bureau, pas sur mobile », tandis que
l'inventaire porte « VOLET MOBILE FERMÉ — certifié en réel le 20/08 ». Les deux
ne peuvent pas être vrais. **À trancher par une mesure live aux deux formats**,
pas par relecture.

### 3. Les trois tests E2E instables

**Ce qui manque** : aucun relevé du *taux* d'échec. « Échoue puis passe au
retry » est une observation, pas une mesure.

**Protocole** : compter les occurrences sur les N derniers runs de `e2e.yml` sur
`main`, et distinguer échec-puis-vert-au-retry d'échec-définitif.

⚠️ Un contre-exemple déjà consigné en mémoire : trois échecs d'affilée ne
suffisent pas à conclure au déterminisme.

---

## Ce que la règle change en pratique

Toute mesure portée dans un fichier de suivi indique désormais :

* la **cible** — production (avec le SHA déployé) ou local (avec le commit) ;
* l'**état de l'arbre** — propre, ou la liste des modifications en cours ;
* la **commande complète**, copiable telle quelle ;
* la **date et l'heure**, pas seulement le jour.

Sans ces quatre éléments, la ligne est une observation. Une observation peut
orienter une recherche ; elle ne peut pas fermer un point ni justifier une
priorité.
