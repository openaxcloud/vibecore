# Recoupements des points ouverts — passe complète

Source : `BUG_INVENTORY_LIVE.md` sur `origin/main`, extrait le 2026-09-01.
**222 points au total, 151 fermés, 71 ouverts.**

Méthode : deux points sont regroupés seulement si le **mécanisme** est le même —
pas si le symptôme se ressemble. Chaque regroupement dit ce qui a été vérifié
dans le code, et ce qui reste une hypothèse à mesurer.

---

## Compte réel

| | |
|---|---|
| Points ouverts déclarés | **71** |
| Doublons littéraux (même défaut, deux entrées) | **3** |
| Points ouverts distincts | **68** |
| **Mécanismes causaux distincts** | **≈ 41** |

Autrement dit : **68 points ouverts pour ~41 causes**. 27 points sont des
symptômes d'une cause déjà listée ailleurs dans l'inventaire.

---

## GROUPE A — Le worker ne tourne pas → plus rien ne réconcilie (6 points, 1 cause)

**Le plus gros gain de la liste.**

| Point | Rôle |
|---|---|
| `BUG-WORKER-001` | **CAUSE** — quatre jobs internes échouent à *chaque* déclenchement, dont `inactivity.gc` |
| `BUG-RUNTIME-GC-DORMANT-001` | symptôme direct — le ramasse-miettes ne tourne pas (0 évènement `workspace.gc` en 24 h) |
| `BUG-RUNTIME-STATUS-DRIFT-001` | symptôme — 125 espaces `RUNNING` en base, **un seul** dans le cluster |
| `BUG-RUNTIME-ORPHELINS-001` | symptôme — des lignes survivent à la suppression de leur disque |
| `BUG-CREATE-001` | symptôme — le quota reste retenu par des espaces bloqués, la création meurt |
| `BUG-CREATE-003` | symptôme inverse — un pod survit à l'arrêt de son enregistrement (fuite) |

**Vérifié** : l'énoncé de `BUG-WORKER-001` nomme explicitement `inactivity.gc`,
`metering.objectStorage`, `metering.database`. C'est bien le job de ramassage.

**Conséquence sur la priorité** : réparer les jobs du worker est la seule action
de la journée qui éteint **six** points. Le correctif de comptage de quota déjà
livré (#297) ne traite que le symptôme `CREATE-001`, et volontairement — il ne
réveille pas le ramasse-miettes, conformément à la consigne sur les 196 espaces.

⚠️ **Ordre obligatoire** : ne pas réparer le worker avant qu'Avi ait tranché sur
les 196 espaces. Réparer `inactivity.gc` en premier, c'est déclencher la
suppression que la consigne interdit.

---

## GROUPE B — Un statut affiché dit « lancé », pas « réussi » (5 points, 1 cause)

| Point | Symptôme |
|---|---|
| `BUG-CREATE-004` | Webview « Prêt » **et** « démarre encore », sans fin |
| `BUG-UX-014` | **doublon littéral de CREATE-004** — même écran, même contradiction |
| `BUG-DEVSTART-STARVED-BY-REVIEW-001` | « Start application — Done » alors que `npm run dev` n'a jamais tourné |
| `BUG-AGENT-003` | « Terminé 100 % » alors que les 5 sous-agents ont échoué et le consensus est rejeté |
| `BUG-PREVIEW-REFRESH-001` | le bouton « Rafraîchir » ne recharge pas vraiment l'iframe |

**Mécanisme commun** : l'état affiché est dérivé du fait qu'une étape a été
*déclenchée*, jamais du fait qu'elle a *abouti*. Une seule règle les couvre :
un indicateur de succès doit lire un résultat, pas un envoi.

**À fusionner** : `BUG-UX-014` dans `BUG-CREATE-004`.

---

## GROUPE C — Le plafond de jetons coupe l'artefact, le parser écrit la coupure (2 points, 1 cause)

| Point | Symptôme |
|---|---|
| `BUG-AGENT-004` | après troncature, la continuation du modèle est écrite **telle quelle** dans le fichier (prose + balises en clair) |
| `BUG-AGENT-005` | au plafond en plein `src/index.css`, le balisage plateforme finit **dans le CSS** et devient un sélecteur → l'app déployée perd tout son responsive |

**Mécanisme commun** : aucune garde ne distingue « artefact complet » de
« flux coupé ». Même correctif : refuser d'écrire un artefact dont la balise
fermante manque.

---

## GROUPE D — Écritures agent non bornées (2 points, 1 cause)

| Point | Symptôme |
|---|---|
| `BUG-PERF-001` | amplification ×40 : **1018 `PUT /files/write` pour 25 fichiers** |
| `BUG-SELFREPAIR-RUNAWAY-LOOP-001` | des centaines de « AI patch accepted » sur les mêmes fichiers (`global.css` ~90× d'affilée) |

**Mécanisme commun** : rien ne dé-duplique ni ne borne une écriture répétée sur
le même chemin. ⚠️ Mesure datée du 15/08, **jamais re-mesurée** depuis.

---

## GROUPE E — Contraste sous le seuil AA (6 points, 1 porte manquante)

`BUG-THEME-002`, `BUG-THEME-004`, `BUG-THEME-006`, `BUG-THEME-007`, `BUG-THEME-008`
+ `BUG-DESIGN-012` (décision d'Avi, à part).

**Mécanisme commun** : aucune porte de contraste en CI. Le balayage déjà écrit
(`app/styles/tint-contrast-sweep.spec.ts`) dérive **43 règles** « texte sur une
teinte de sa propre couleur » de la CSS compilée — il couvre THEME-006/007/008
d'un coup. THEME-002/004 relèvent du gris tertiaire et de l'orange de marque.

**`BUG-DESIGN-012` n'est pas un bug** : l'orange `#f26207` à 3,22:1 est une
décision de marque qui appartient à Avi, pas une régression.

**`BUG-THEME-003` est un non-défaut** — l'énoncé lui-même conclut « AUCUN défaut
de thème, mesuré dans l'IDE réel en 390 ». **À fermer sans correctif.**

---

## GROUPE F — Anglais résiduel dans une interface française (6 points, 1 porte morte)

`BUG-I18N-001`, `BUG-I18N-003`, `BUG-I18N-006`, `BUG-I18N-007`, `BUG-I18N-009`,
`BUG-CREATE-009`.

- `BUG-I18N-001` et `BUG-I18N-009` portent sur **la même page** `/solutions`.
- La porte qui devrait tous les attraper est `BUG-CI-010` : l'audit i18n live
  n'a **jamais** été vert (37 annulés / 12 échecs / **0 succès** sur 50 runs).

**Conséquence** : tant que `CI-010` est rouge, ces 6 points se reformeront. La
cause de fond est la porte, pas les chaînes. ⚠️ Voir aussi la note mémoire :
le shard `mobile-390` est rouge **par timeout de 90 min sur toutes les branches**
depuis le 24/08 — l'audit i18n mobile ne donne plus **aucun** signal.

---

## GROUPE G — Portes CI rouges en permanence (6 points, 2 causes)

| Point | Cause |
|---|---|
| `BUG-CI-007` | empaquetage macOS — `electron-builder` / `DOMParser` |
| `BUG-CI-009` | build Windows — `EBUSY` à la copie des assets |
| `BUG-CI-008` | Playwright meurt avant tout test : la base ne démarre pas (`P1001`) |
| `BUG-CI-010` | audit i18n live, 0 succès sur 50 |
| `BUG-SEO-TWITTER-DUP` | **symptôme *dans* CI-010** — `twitter:title` en double fait échouer l'audit |
| `BUG-BUILD-003` | le déploiement ne reconstruit **jamais** le tier `admin` |

CI-007 + CI-009 = même famille (build desktop). `BUG-SEO-TWITTER-DUP` est à
traiter **avant** CI-010, sinon la porte reste rouge après réparation.

⚠️ `BUG-BUILD-003` est de la même classe que le blocage de déploiement que j'ai
levé en #295 : **du travail fini qui dort** parce que la chaîne ne le publie pas.

---

## GROUPE H — Le panneau Git ne voit pas les fichiers (3 points, 1-2 causes)

| Point | Symptôme |
|---|---|
| `BUG-GIT-003` | une modification enregistrée dans l'IDE est **invisible** pour Git |
| `BUG-GIT-001` | « Committer les modifications » répond `200` et ne committe **rien** |
| `BUG-GIT-002` | `/git` lance à chaque chargement deux requêtes vouées à échouer |

**Hypothèse forte, à mesurer** : GIT-001 et GIT-003 sont le même mécanisme —
git tourne sur le **pod API** alors que les fichiers sont sur le **pod
workspace**. C'est un piège déjà rencontré et documenté. Un `200` sans commit
et une modification invisible sont exactement ce que produit un dépôt vide côté
API. **Non vérifié dans le code à cette date** — c'est une hypothèse, pas un fait.

---

## GROUPE I — Stockage d'objets : Workload Identity cassé (3 lignes, 1 cause, 1 collision d'ID)

⚠️ **Deux lignes différentes portent l'identifiant `BUG-STORAGE-002`.**

| Ligne | Contenu |
|---|---|
| `BUG-STORAGE-002` (a) | le pod API ne peut pas obtenir de jeton GCP, la requête pend 30 s puis échoue |
| `BUG-STORAGE-002` (b) | **CAUSE** — l'egress vers le serveur de métadonnées est absent du chart |
| `BUG-UX-019 (suite)` | symptôme d'ergonomie — les 45 s d'attente du panneau |

(b) est la cause de (a). La collision d'identifiant doit être corrigée dans
l'inventaire (renommer (b) en `BUG-INFRA-002`), sinon un `grep` sur l'ID
renverra toujours deux défauts distincts.

---

## GROUPE J — Le terminal ne se rattache jamais (2 points, 1 cause)

| Point | Symptôme |
|---|---|
| `BUG-TERM-002` | le client forge un `sessionId` **neuf** à chaque tentative de connexion |
| `BUG-QUOTA-001` | le quota `terminals.concurrent` compte **par connexion**, donc un rattachement consomme un second créneau → `429` |

**Mécanisme commun** : la reconnexion crée une nouvelle identité au lieu de se
rattacher à l'existante. Réparer `TERM-002` fait disparaître le `429` de
`QUOTA-001` sans toucher au quota.

---

## GROUPE K — 502 sec au lieu d'un état réessayable (2 points, 1 cause)

`BUG-CREATE-006` (démarrage à froid → 502) et `BUG-API-004` (course au
provisioning : l'API tape l'agent avant que le DNS du Service soit résolvable →
502 au lieu de « en cours »). **Quasi-doublons.** Même correctif : rendre un état
réessayable au lieu d'un 502.

---

## GROUPE L — Le tour guidé (2 points, 1 cause)

`BUG-UX-TOUR-REAPPEARS` (réapparaît à chaque ouverture) et `BUG-UX-018` (la carte
surgit ~20 s après le chargement et **vole le clic**). Même composant.

---

## GROUPE M — Génération : l'app produite ne marche pas (3 points, cause commune probable)

`BUG-GEN-BACKEND-UNSERVED-001`, `BUG-DEPLOY-010` (bac à sable créé **vide**,
`package.json` absent), `BUG-IDE-007` (l'arbre annonce 9 fichiers puis 10).

**Hypothèse** : les fichiers générés ne sont pas tous livrés au runtime — c'est
exactement le P0 d'août (12 fichiers livrés sur 27). **À mesurer**, pas encore
établi.

---

## GROUPE N — Le paramètre `thinking` (2 points + 1 protection)

`BUG-CHAT-THINKING-001` et `BUG-AGENT-008` sont **le même mécanisme**. Le
correctif est livré et prouvé live (Helm rev 1112 : 0→6 écritures de fichiers).
`FEAT-LLM-001` (repli multi-fournisseur) est la protection au-dessus, pas un
doublon : elle couvre une panne Anthropic, pas ce paramètre.

**Les deux points sont fermables avec preuve.**

---

## Points réellement isolés (23)

`BUG-CREATE-005`, `BUG-CREATE-007`, `BUG-CREATE-008`, `BUG-CREATE-011`,
`BUG-USR-003`, `BUG-AGENT-UI-001`, `BUG-SEC-002`, `BUG-SEC-SCANNER-PHANTOM-FINDING`,
`BUG-AUTH-001`, `BUG-INFRA-001`, `BUG-WEB-001`, `BUG-WORKER-002`, `BUG-IDE-008`,
`BUG-FH-001`, `BUG-FH-002`, `BUG-UX-015`, `BUG-IDE-LAYOUT-URL-NAV-RACE`,
`BUG-STORAGE-QUOTA-002`, `BUG-CREATE-002`, `BUG-CREATE-009`, `BUG-I18N-003`,
`BUG-DESIGN-012`, `BUG-THEME-003`.

---

## Correction d'une conclusion antérieure

J'avais annoncé `BUG-CREATE-002` + `BUG-IDE-013` comme un recoupement — « le
message atterrit dans un panneau qui ne s'ouvre jamais ». **C'est faux.**

`BUG-IDE-013` est fermé sur son volet mobile depuis le 20/08 (`bdaf5af8cc`), et
sur bureau le panneau s'ouvre correctement : `ProjectBottomTerminal` est un
composant **entièrement contrôlé** — il n'a aucun état interne et lit la prop
`active` directement, donc `openBottomTerminal('problems')` l'ouvre bien sur la
bonne vue.

Le vrai défaut de `BUG-CREATE-002` est plus précis : le « ! » du quota est posé
sur la pastille « espace de travail », **dont le `onClick` ouvrait la vue
`terminal`** — le Shell, où le message n'est pas rendu. Cliquer sur le signal
menait à la mauvaise vue. Corrigé sur `fix/quota-rejet-visible`.

---

## Ordre de priorité qui en découle

| # | Action | Points éteints | Note |
|---|---|---|---|
| 1 | Réparer les jobs du worker (`BUG-WORKER-001`) | **6** | ⚠️ **bloqué** : arbitrage d'Avi sur les 196 espaces requis d'abord |
| 2 | Réparer `BUG-SEO-TWITTER-DUP` puis `BUG-CI-010` | **7** | débloque la porte i18n, qui garde ensuite les 6 points I18N |
| 3 | Garde « artefact tronqué » (`GROUPE C`) | 2 | P0 d'intégrité : corruption silencieuse de fichiers |
| 4 | Règle « succès = résultat, pas envoi » (`GROUPE B`) | 5 | 1 doublon à fusionner au passage |
| 5 | Porte de contraste en CI (`GROUPE E`) | 5 | outil déjà écrit, 43 règles dérivées |
| 6 | Rattachement du terminal (`BUG-TERM-002`) | 2 | éteint le `429` sans toucher au quota |
| 7 | Egress métadonnées dans le chart (`GROUPE I`) | 3 | + corriger la collision d'ID |
| 8 | Borner les écritures agent (`GROUPE D`) | 2 | re-mesurer d'abord : chiffre du 15/08 |
| 9 | État réessayable au lieu de 502 (`GROUPE K`) | 2 | quasi-doublons |
| 10 | Tour guidé (`GROUPE L`) | 2 | |

**Trois points sont fermables immédiatement, sans écrire une ligne :**
`BUG-THEME-003` (non-défaut établi par son propre énoncé), `BUG-CHAT-THINKING-001`
et `BUG-AGENT-008` (correctif prouvé live, Helm rev 1112).

**Deux fusions d'entrées** : `BUG-UX-014` → `BUG-CREATE-004` ; renommer la
seconde `BUG-STORAGE-002`.
