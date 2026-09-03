# REGISTRE_AUDIT_EXPERT — registre complet de l'audit externe

**Objet.** Registre **exhaustif** des points remontés par l'audit externe. Aucun point
n'est perdu : chaque point de la remise devient **une ligne** portant un identifiant
stable `AUDX-NNN`, son énoncé, son domaine, sa sévérité, son statut, sa preuve, un
propriétaire proposé et, quand elle existe, la décision d'arbitrage déjà prise.

**Base de vérification.** `origin/main` @ `9b59b3489` (2026-09-01). Toutes les preuves
ci-dessous ont été **relues sur cette base**, pas sur une branche de travail.
⚠️ Les branches de travail locales sont très en retard sur `main` (jusqu'à ~990 commits) :
une preuve prise sur une branche peut contredire `main`. Exemple rencontré pendant la
rédaction : `BaseChat.tsx` fait **23 745** lignes sur `main` mais 20 667 sur une branche
stale — les chiffres de l'audit sont exacts, c'est la branche qui mentait.

**Règle de statut.** `NON_COMMENCÉ` est le défaut. `DÉJÀ_FAIT` et `PARTIEL` ne sont
posés **qu'avec une preuve vérifiée dans le code**, citée en clair (fichier:ligne,
commande, ou sortie). Aucun statut n'est déduit d'un « ça devrait être fait ».
`PARTIEL` = un mécanisme existe et est cité, mais ne couvre pas l'énoncé complet ;
c'est délibérément distingué de `DÉJÀ_FAIT` pour ne pas fermer un point à moitié traité.

### ⚠️ « Livré » n'est pas « exercé » — les deux états sont distincts

Un point porte **deux états séparés**, et le second ne se déduit jamais du premier :

| État | Ce qu'il affirme | Ce qu'il n'affirme PAS |
|---|---|---|
| 💻 **Livré** | le code est écrit, testé unitairement, mergé | que quiconque l'ait vu fonctionner |
| ✅ **Exercé en réel** | quelqu'un a emprunté le chemin, à l'écran, dans les 3 formats | — |

**Aucune ligne de ce registre n'est ✅ Exercé.** Les correctifs ouverts en PR sont
au mieux 💻 ; tant qu'une PR n'est pas mergée ET le chemin parcouru en réel, le
point reste ouvert. Une ligne marquée « CORRIGÉ — PR #N » signifie **le code
existe**, rien de plus.

⚠️ **Ce n'est pas de la prudence rhétorique, c'est un mode d'échec observé.**
Voir **AUDX-160** : la pastille « aller au dernier message » était livrée depuis
des semaines, cochée comme faite — et **rendue hors écran**, donc inutilisable
par tout le monde, tout ce temps. Le code était juste ; personne n'avait regardé.

⚠️ **Ce registre trace, il ne réalise pas.** Une ligne `NON_COMMENCÉ` reste ouverte tant
qu'elle n'a pas été **testée en réel** au sens de `CLAUDE.md` (📤 dispatché / 💻 codé /
✅ testé live — seul ✅ compte).

---

## ⚡ ACTION AVI — ce qui ne peut pas être fait depuis une PR

Ces lignes exigent un réglage de dépôt ou une console fournisseur. Elles sont
**inscrites ici parce que c'est leur place**, pas pour être répétées.

### À présenter une fois

| ID | Le geste exact | Pourquoi |
|---|---|---|
| **AUDX-137** | Dans **Settings → Environments** du dépôt `openaxcloud/vibecore`, ouvrir l'environment **`pr-ai-secrets`** et cocher **« Required reviewers »** avec au moins un mainteneur. | C'est un **interrupteur de configuration du dépôt**, pas un secret à manipuler. Sans lui, l'`environment:` posé par la PR #352 sur `e2e.yml` existe mais **ne protège rien** — AUDX-097 reste partiel jusque-là. |

### Enregistrées, à ne plus remonter

Le sujet des clés et des jetons a été **explicitement clos par Avi**. Les deux
lignes ci-dessous restent au registre parce qu'un registre qui efface ce qui
dérange ne vaut rien — mais elles **ne doivent plus être resurfacées** dans les
comptes rendus. Elles sont à Avi, à son moment.

| ID | Ce qu'il resterait à faire | Statut |
|---|---|---|
| **AUDX-139** | Rotation des clés IA (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`) exposées aux PR de même origine avant la PR #352. | 🔒 **Clos par Avi — ne plus remonter** |
| **AUDX-147** | Révocation/réémission des certificats de signature Apple (`DESKTOP_CSC_LINK`) et Windows (`DESKTOP_WIN_CSC_LINK`) exposés par `electron.yml` avant la PR #352. | 🔒 **Clos par Avi — ne plus remonter** |

⚠️ **Conséquence technique à connaître, sans la re-plaider** : la correction de
code ne rétroagit pas sur une exposition passée. Les lignes du registre qui en
dépendent (AUDX-097 pour l'une, AUDX-098 pour l'autre) sont **traitées côté code**
et n'attendent rien d'autre pour être fermées de leur côté.

---

## 📍 État des demi-correctifs — au 2026-09-02

Un point à moitié fermé finit compté comme fermé. Les 🟠 que j'ai moi-même
signalés sont donc suivis ici explicitement, avec ce qui les bloque.

| Point | PR | État | Ce qui reste, et pourquoi |
|---|---|---|---|
| AUDX-004 | #357 | ✅ **refermé** | Usage unique livré sur les upgrades (Redis `SET NX`). Reste assumé : pas de révocation à la déconnexion, le ticket expire (TTL 120 s). |
| AUDX-006 | #362 | ✅ **refermé** | Git et webhook câblés. Reste ❌ le rebinding **TOCTOU complet** — exigerait d'épingler l'IP jusqu'à la socket, non exposé par les clients HTTP en place. |
| AUDX-005 | #361 | ⛔ **BLOQUÉ_HORS_CODE** — retiré de la file | Code prêt et testé, enforcements `OFF` par défaut. **Sorti de la file de travail le 02/09** : y revenir à chaque tour serait une pression inutile sur un blocage que le code ne peut pas lever. **Ordre de bascule à suivre le jour venu — écrit maintenant, pendant qu'il est frais :** ① l'app émet le cookie `vc_preview` (`Domain=.e-code.ai`, HttpOnly, signé HMAC) ; ② **attendre la propagation** — au moins une session complète d'utilisateurs actifs, le cookie n'existant pas rétroactivement ; ③ vérifier sur un échantillon que les requêtes d'aperçu le portent bien ; ④ **alors seulement** passer `PREVIEW_PROXY_ENFORCE_TENANT=1`, puis ⑤ `PREVIEW_ENFORCE_PRIVATE_PORTS=1`. ⚠️ **Inverser ① et ④ met 403 sur CHAQUE aperçu de la plateforme.** ⚠️ Rollback : repasser ④/⑤ à `0` — instantané, sans migration. **D-02 (« aperçus privés par défaut ») reste non tenue jusque-là.** |
| AUDX-017 | #365 | ⛔ **BLOQUÉ_HORS_CODE** — retiré de la file | Rend la sous-déclaration **visible et réconciliable**, pas **impossible**. L'impossibilité exige que le serveur connaisse le vrai usage, donc le reroutage **C1.b.4** de l'appel LLM par l'ai-gateway. ⚠️ **Fausse piste écartée, et confirmée comme telle** : faire *capturer* le hold d'AUDX-018 à l'expiration rendrait le non-rapport coûteux — mais **facturerait les générations échouées**. Écarté : on ne remplace pas une sous-facturation par une **surfacturation**. **Sorti de la file le 02/09** ; **C1.b.4 n'est PAS à lancer maintenant** — c'est un chantier qui entrerait en concurrence avec les points de sévérité restants. |
| AUDX-007 | #363 + **#373** | 🟠 **5 des 5 ne persistent plus le secret** | **#373 fait Vercel de bout en bout** comme migration de référence : montée du jeton au serveur puis effacement local **uniquement sur succès confirmé** (l'inverse serait une perte de données), et arrêt de la persistance du jeton. Helper rangé dans `app/lib/connections/` — **pas** dans le composant — pour que les 4 suivants soient des copies (AUDX-163). **Les 5 sont faits** : plus aucun store n'écrit son PAT. ⚠️ **Supabase en portait DEUX** — le `token` de management **et** `credentials` (clé anon), sous une clé nommée `supabaseCredentials`. **Reste** : le **routage des appels** par `connector-proxy`, non entamé, et la migration du jeton **existant** n'est câblée que pour Vercel. |

---

## 🔎 Passe SÉCURITÉ & DONNÉES — 2026-09-03 (2ᵉ tour : « règle tout »)

Territoire inchangé : `services/`, migrations, manifests. `BaseChat.tsx` non touché.

**La file est vidée.** 11 points fermés au total sur les deux tours.

| PR | Point | Le défaut, en un chiffre |
|---|---|---|
| #416 | **AUDX-014** (P0) | commit sur l'autre pod → **409** ; create rejoué → **2ᵉ job, 2ᵉ réservation** ; cancel → réservation **jamais libérée** |
| #416 | **AUDX-015** | `writeFiles` en échec laissait **1 projet fantôme au lieu de 0** |
| #414 | **AUDX-023** | une org n'ayant QUE des objets GCS était métrée à **zéro** |
| #414 | **AUDX-020** | aucun quota d'aucune sorte avant signature |
| #419 | **AUDX-022** | jeton **lecture seule** → `DELETE /bucket` **200** |
| #420 | **AUDX-012** (2ᵉ volet) | `workspace-manager` touche **1 table sur 125**, en atteint **125** |
| #418 | **AUDX-013** | matrice validée par mutation : **7 sondes** passent au rouge |
| #415 | **AUDX-170** | **51 paquets esbuild** atteignables depuis les dépendances de prod |

### Le fil rouge de ce tour : les gardes creux

**Quatre gardes que j'ai écrits ne prouvaient rien**, et chacun a été trouvé
seulement en essayant de le faire échouer. Aucun ne l'aurait été par relecture.

1. **AUDX-170, garde v1** — lisait `node_modules`, donc rendait le verdict d'un
   AUTRE checkout ; il déclarait l'arbre **corrigé** cassé.
2. **AUDX-170, garde v2** — lisait le lockfile mais passait la **version nue**
   comme clé de snapshot : la marche s'arrêtait après les dépendances directes
   et le garde **passait sur `main`**, où le défaut est certain.
3. **AUDX-012, garde v1** — ne regardait que le répertoire du service, donc ne
   voyait pas `CONFIG_ENCRYPTION_KEY`, lu via `packages/security`. Il aurait
   déclaré la clé inutile et **cassé le déchiffrement du worker**.
4. **AUDX-013, sonde de révocation** — `store.deleteSession?.(...)`, méthode
   inexistante. Le `?.` ne révoquait rien, la requête suivante répondait 200, et
   l'échec **ressemblait à une faille d'authentification**.

⚠️ **Règle qui en sort** : un garde n'existe qu'une fois qu'on l'a vu ÉCHOUER sur
le défaut qu'il prétend attraper. Et un `?.` sur le geste qu'un test existe pour
poser transforme une méthode absente en garde silencieusement creux.

### L'autre fil : les listes dérivées par grep

**Trois fois** une liste construite par grep aurait cassé la production :
`CONFIG_ENCRYPTION_KEY` (transitif), les secrets OAuth (nom **calculé**), et
`ProviderConfig` atteint par `sharedGatewayDbClient` et non `prisma`. C'est
pourquoi le SQL de GRANT d'AUDX-012 est livré **marqué « ne pas appliquer »**.

### Un accident de livraison, à connaître

**PR #402 (AUDX-022) a été fermée AUTOMATIQUEMENT** par GitHub quand sa branche
de base (#400) a été supprimée après fusion. Le correctif — *un jeton de lecture
pouvait détruire le seau* — **n'était pas dans `main`**, et rien ne le signalait.
Rebasée et rouverte en **#419**.

⚠️ **Toute PR empilée est exposée à ça.** Vérifier après chaque fusion qu'aucune
PR fille n'a été fermée sans être fusionnée.

---

## 🔎 Passe SÉCURITÉ & DONNÉES — 2026-09-03 (1ᵉʳ tour)

Territoire : `services/`, migrations Prisma, manifests. `BaseChat.tsx` non touché.

**5 correctifs ouverts, chacun avec sa contre-épreuve** (un test qui échoue sur
le code d'origine et passe sur le correctif) :

| PR | Point | Le défaut, en un chiffre |
|---|---|---|
| #398 | AUDX-010 | 13 colonnes chiffrées, 4 services, **1 seule clé sans identité** — changer `CONFIG_ENCRYPTION_KEY` rendait tout le corpus illisible |
| #399 | AUDX-011 | journal « immuable » : **9 gestes de falsification sur 9 réussissaient**, TRUNCATE compris |
| #400 | AUDX-024 | **1 000 objets sur 2 500** listés ; **1 000 supprimés sur 2 500** avec retour `deleted: true` |
| #401 | AUDX-012 | **31 secrets × 8 services** ; le screenshotter portait Stripe et les 6 clés IA |
| #402 | AUDX-022 | jeton **lecture seule** → `DELETE /bucket` **200** |
| #403 | AUDX-021 | URL d'upload signée ne liant que `Content-Type` : **aucun plafond d'octets** |

### Trois pièges rencontrés, notés parce qu'ils se reproduiront

1. **Un double de test peut cacher le défaut qu'il est censé couvrir.** Le faux
   GCS ignorait `maxResults` : le test « *deletePrefix removes every object* »
   était vert **parce que** le double ne modélisait pas la pagination réelle.
2. **Une liste d'autorisation par grep manque les accès par nom calculé.** Un
   allowlist de secrets dérivé par grep aurait cassé la connexion Google —
   `process.env[\`${provider.toUpperCase()}_CLIENT_SECRET\`]`. Et un garde qui ne
   lit que le répertoire du service manque les secrets lus **transitivement**
   (`CONFIG_ENCRYPTION_KEY` via `packages/security`).
3. **`node_modules/@e-code/sdk` est un lien RELATIF vers le checkout principal.**
   Dans un worktree, les tests exécutent alors le code **non modifié** — le
   correctif paraît cassé alors qu'il n'est simplement pas chargé.

### Ce qui reste ouvert dans ce lot, et pourquoi

- **AUDX-014 (P0)** — mesuré : ~50 % des imports échouent au commit à 2 replicas.
  Le correctif est un **chantier** (staging + registre de crédits partagés) ;
  à moitié fait il serait pire que l'état actuel.
- **AUDX-023 → AUDX-020** — la facturation du stockage objet compte une table
  PostgreSQL, pas GCS ; le quota ne peut exister avant l'inventaire réel. La
  primitive manquante (`listAllObjects`) est livrée par #400.
- **AUDX-013** — non entamé. À noter : un jeu adversarial croisant les **verbes**
  aurait attrapé AUDX-022 seul.
- **AUDX-012** — rôles DB par service non séparés (`DATABASE_URL` unique).

---

## 0. Décisions déjà prises (cadre non rediscuté)

Ces décisions sont **acquises** et s'appliquent à toutes les lignes du registre.
Une ligne qui les contredit doit être corrigée, pas la décision.

| # | Décision | Portée |
|---|---|---|
| D-01 | **1 000 espaces de travail simultanés** est la cible de dimensionnement | Runtime, échelle, coûts |
| D-02 | Les **aperçus sont PRIVÉS par défaut** | Sécurité preview |
| D-03 | **Rétention, prix, plans, régions, SLA** = décisions d'**Avi**, en attente | Facturation, produit |
| D-04 | Collaboration : **CAS avec conflits explicites**, **PAS de CRDT temps réel** pour l'instant | AUDX-034→042 |
| D-05 | Un **checkpoint couvre fichiers + base PostgreSQL** | AUDX-043→053 |
| D-06 | Scheduler : après une panne, rejouer **UNE seule** occurrence manquée, jamais toutes | AUDX-054→064 |
| D-07 | Pool **gVisor isolé DANS le même cluster**, pas de cluster séparé | AUDX-065→080 |
| D-08 | Vérifier si le **second cluster Terraform** est réellement inutilisé ; le supprimer si oui (coût inutile) | AUDX-080 |
| D-09 | `ecode.lock` **généré automatiquement** mais **obligatoire une fois généré** | AUDX-071 |
| D-10 | **Firecracker reporté** | Runtime |
| D-11 | Le **menu bas mobile/tablette d'Avi est CONSERVÉ** | AUDX-101→113 |
| D-12 | L'**orange de marque n'est PAS changé** — on corrige la façon de poser du texte dessus | AUDX-109 |
| D-13 | Les **deux gros découpages sont REPORTÉS** tant que les défauts visibles d'Avi ne sont pas réglés (trois sessions travaillent dans ces fichiers en ce moment) | AUDX-115, AUDX-116 |
| D-14 | Gouvernance : **fermer les PR mortes et les doublons**, mais **PAS de rebasage en masse** des 72 PR | AUDX-153 |
| D-15 | Parité : cible = **parité fonctionnelle observable et datée**, jamais la reproduction prétendue de systèmes internes propriétaires | AUDX-118→132 |
| D-16 | Le **gate exact-SHA et ses tests internes sont jugés corrects** — ne pas les casser | AUDX-081→100 |

### Ordre de correction retenu

| Rang | Vague | Lignes concernées |
|---|---|---|
| 1 | **Sécurité immédiate** — secret agent, symlinks, ticket runtime, previews HTTP/WS, WIF, secrets dans les PR | AUDX-001→013, 095→097, 133, 134 |
| 2 | **Argent et données** — metering IA, Stripe/outbox, object storage, import, restore DB, collaboration | AUDX-014→042 |
| 3 | **Runtime** — snapshots, scheduler, NetworkPolicies, admission, quotas, Nix | AUDX-043→080 |
| 4 | **Release** — CI bloquante, actions/images immuables, historique Git, images signées | AUDX-081→100 |
| 5 | **Échelle** — workers/KEDA, GCS/CDN, autoscale, load/soak/chaos/DR | AUDX-076→079, 143 |
| 6 | **Parité produit** | AUDX-118→132 |

**Propriétaires proposés** (rôles, pas personnes) : `SEC` sécurité applicative · `BE`
backend/données · `BILL` facturation · `RT` runtime/Kubernetes · `REL` release/CI ·
`FE` frontend/UX · `PROD` produit/parité · `GOV` gouvernance dépôt · `AVI` décisions
et accès hors dépôt.

---

## 1. Sécurité applicative — AUDX-001 → AUDX-013

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-001 | Exfiltration par **symlinks Git** dans `conflict-file`, `import`, `pull`, `restore` | P0 | **✅ CORRIGÉ — PR #355 (ouverte)** | ⚠️ **Le défaut était côté API, pas côté agent** — la garde de l'agent citée précédemment était une piste partiellement fausse. `safeProjectPath` (`services/api/src/project-storage.ts`) est **purement lexical** (`normalize` + `relative`) : il ne voit pas un lien. Git transportant les liens (mode 120000), un dépôt importé/cloné/pullé plante `lien -> /etc/passwd` ou `-> ../<autre-projet>/…` ; `conflict-file` **lit à travers** (exfiltration inter-locataire), les écritures **écrivent à travers**. **Correctif : 7 sites d'appel** (writeFiles, importZip, restoreSnapshot, materializeWorkingTree lecture+écriture, conflictFile, markResolved) via `containedWorkspacePath`/`containedProjectPath` — **nommés** pour que la couverture se vérifie au grep. Garde alignée sur celle de l'agent : `lstat` du composant final (lien **pendant**) + `realpath` du plus proche ancêtre existant (**répertoire** lié) + re-contrôle après `mkdir`. ⚠️ **Régression de disponibilité attrapée en cours de route** : première version remontant **au-delà** de la racine → la racine d'un workspace secondaire étant créée paresseusement, toute première écriture ressemblait à une évasion (**5 tests métier rouges**). Boucle bornée **à** la racine + test dédié : une garde qui bloque le travail normal se fait revert, pas corriger. ⚠️ **Deux suppositions écartées** : restore/import **vident l'arbre** d'abord (un lien planté à la racine disparaît — mes premiers tests passaient pour la **mauvaise raison**, retargetés sur `.git/` que le clear préserve) ; `listFiles` ne suit **pas** les liens (sémantique `lstat` des Dirent) — **asserté**, pas supposé. **8 contre-épreuves**, dont les 2 moitiés de garde prouvées indépendamment nécessaires. **1891 tests API verts**, build `tsc` strict vert, parité lint exacte. | SEC | — |
| AUDX-002 | **Courses TOCTOU** des opérations fichiers du workspace-agent | P0 | NON_COMMENCÉ | Le contrôle actuel est un `lstat` **après** résolution de chemin (`app.ts:1680`) : c'est exactement la forme check-then-use vulnérable. Aucun `O_NOFOLLOW` / `openat` / descripteur épinglé dans `services/workspace-agent/src`. | SEC | — |
| AUDX-003 | **Secret HMAC global** visible par le code locataire via `/proc` | P0 | **✅ CORRIGÉ — PR #354 (ouverte)** | **Défaut confirmé** : `manager.ts` écrivait `stringData: { tokenSecret: this.tokenSecret }` — le secret **racine verbatim** — dans le Secret K8s de chaque workspace, **monté dans le pod du locataire**. Le scrub `AGENT_PRIVATE_ENV_KEYS` (`workspace-agent/src/app.ts:120`) fermait la fuite vers les processus enfants mais la valeur restait **globale** dans le pod → une fuite = forge de jetons pour **tous** les workspaces. **Correctif** : le pod ne reçoit que `HMAC(racine, workspaceId)` avec séparation de domaine ; le secret racine ne quitte plus le manager. ⚠️ **Piège traité** : un changement de Secret **ne se propage pas** dans un pod déjà en cours (`secretKeyRef` résolu au démarrage) — marquer le nouveau schéma sans vérifier aurait signé un pod hérité avec une clé absente → 401 → le self-heal re-émet le **même** mauvais secret → workspace **bloqué**. D'où `agentTokenScheme` (migration 0084, défaut `root`), avancé **seulement** si la sonde `getPod` montre que ce démarrage a créé le pod, et repli fail-safe sur `root` pour tout schéma inconnu. ⚠️ **Un test épinglait la faille** (`tokenSecret === secret racine`) — retourné. **5 contre-épreuves, 5 mécanismes** (racine remis → 3 rouges ; derived-v1 inconditionnel → 1 ; toujours dérivé → 2 ; schéma inconnu deviné → 1 ; dérivation non séparée → 2, dont la contrefaçon inter-tenant). 313 tests verts, 0 lint introduit. | SEC | — |
| AUDX-004 | Remplacer le **bearer de session exposé au navigateur** par un **ticket runtime** court, limité au workspace, à usage unique | P0 | **✅ CORRIGÉ — PR #357 (ouverte, complétée)** | **Défaut confirmé, pire que décrit** : `/api/runtime-token` faisait `return json({ token: readSessionToken(request) })` — il rendait **la valeur du cookie de session httpOnly** au JavaScript, annulant httpOnly entièrement (XSS ⇒ session complète, pleins privilèges). En plus, le résolveur client lisait **d'abord** `localStorage['runtime-auth-token']`. **Livré** : ticket HMAC **120 s**, porté sur **un projet**, accepté **uniquement** sur `/api/runtime/*`, construit comme le ticket WS collaboration déjà présent (une seule forme de ticket, séparation de domaine pour empêcher le croisement). Portée **appliquée** : le workspace de la route est résolu et comparé au projet du ticket. Cache client **par projet**. `localStorage` supprimé. ⚠️ **Piège déjà payé par ce dépôt, non répété** : le `preHandler` sort tôt sur toute requête ticketée et **saute la liste d'IP** — l'omission avait déjà été livrée sur le ticket collaboration ; le contrôle est ré-appliqué. ⚠️ **La route web n'avait AUCUN test** : la rétablir en version fuyante passait les **1114 tests**. Trou comblé. **Complété le 02/09 — usage unique ✅**, adossé à Redis (`SET NX`, la primitive atomique). ⚠️ **Portée dite franchement** : appliqué aux **upgrades** (WS/SSE), là où le ticket voyage en **query string** et fuit donc dans les journaux, le `Referer`, l'historique et les proxys — `bearerToken()` n'honore `?token=` que pour les upgrades, précisément pour cette raison. **Délibérément pas** au HTTP ordinaire : l'adaptateur réutilise UN ticket pour chaque appel fichiers/ports/logs pendant 2 min ; le brûler par requête imposerait un aller-retour de frappe avant chacune — **panne auto-infligée sur le chemin chaud**, épinglée par un test. **Fail-closed** sur erreur de magasin. **Reste assumé** : le ticket **n'est pas révoqué par la déconnexion**, il expire (pas de `findSessionById` au store) — TTL 120 s. **8 contre-épreuves**, 17 tests. Build `tsc` strict vert, parité lint exacte. ⚠️ Suite API complète **non concluante** sur la machine (0/4/25 échecs disjoints, ~5 s = timeouts) ; **baseline non modifiée à 48 échecs** dans les mêmes conditions ⇒ flakiness d'environnement, pas régression. | SEC | Usage unique = chantier `jti`/Redis distinct |
| AUDX-005 | Authentification **fail-closed des previews HTTP et WebSocket/HMR** | P0 | **🟠 PARTIEL — PR #361 (ouverte)** | **Deux défauts indépendants, dont un que le code documentait lui-même.** **(a) HTTP** : `isPortPrivate()` renvoyait `false` (« public, proxifie ») sur **tout** échec de lookup — commentaire d'origine : « *fails OPEN on lookup error* ». Un hoquet de l'api rendait **public tout port privé de la plateforme**, en silence. Désormais inconnu = privé, avec re-essai + réutilisation 10 s de la dernière réponse **connue** pour ne pas fabriquer d'inconnues à partir de bruit. **(b) WebSocket : aucune garde, du tout** — `resolveAgent(workspaceId)` **sans orgId** et zéro contrôle de port ⇒ quiconque apprenait un `workspaceId` ouvrait la socket HMR d'un **autre locataire**. Ajoutés : garde locataire (refus dur, jamais de repli anonyme), transmission de l'`orgId` (sans elle le contrôle de propriété est **inatteignable** — la garde avait l'air présente en n'appliquant rien), garde de port privé fail-closed. ⚠️ **Aucun test n'épinglait le fail-open** : les 109 tests existants passaient avec. Même motif que sur AUDX-004. ⚠️ **Règle 19 respectée** : « privé » = « session requise », pas « personne » — le propriétaire a le cookie et passe pendant une panne api ; 2 tests dédiés le prouvent. **5 contre-épreuves**, 10 tests ajoutés, 119 verts, build vert, parité lint exacte. **Reste — pourquoi PARTIEL** : les deux enforcements restent **par défaut OFF** (dark-launch). Les activer est une **bascule d'exploitation coordonnée** (l'app doit émettre `vc_preview` d'abord, sinon 403 sur chaque aperçu). **Cela contredit encore D-02 (« aperçus privés par défaut ») : le code est prêt, la bascule reste à faire.** | SEC / AVI | Bascule = action d'exploitation, pas de PR |
| AUDX-006 | **DNS rebinding et SSRF** Git / webhook / screenshotter | P0 | **✅ CORRIGÉ — PR #362 (ouverte, complétée)** | **Deux défauts distincts.** (a) `allow.length > 0 && !hostAllowed(...)` : avec une allowlist **vide**, le contrôle était **entièrement sauté** ⇒ `/capture` devenait un **rendeur ouvert** vers toute adresse joignable, dont `169.254.169.254` (métadonnées cloud = identifiants). Le commentaire disait « MUST be set in production » ; **rien ne le vérifiait** — même forme qu'AUDX-005. (b) Le contrôle portait sur la **chaîne** du nom : un sous-domaine légitime d'un suffixe autorisé est un enregistrement A ordinaire et peut pointer vers l'adresse de métadonnées. **Livré** : `checkOutboundUrl()`/`isBlockedOutboundAddress()` dans `@vibecore/security` — allowlist vide = **refus**, littéraux bloqués (loopback/RFC1918/CGNAT/link-local/multicast/réservé), IPv6 dont **IPv4-mappées** (`::ffff:169.254.169.254`, contournement classique), **résolution puis inspection** des adresses, résolution en échec = refus. **Échec au démarrage** si l'allowlist manque en production. ⚠️ **Deux tests existants configuraient le service SANS allowlist** — la mauvaise configuration exactement ; corrigés. ⚠️ **Limite écrite dans le code** : ferme le trou au **moment du contrôle**, pas la course **TOCTOU** complète (exigerait d'épingler l'IP jusqu'à la socket, non exposé par les clients HTTP en place). **5 contre-épreuves**, 12 tests, 155 verts, builds verts, parité lint exacte. **Complété le 02/09** : **Git ✅** — `git clone` recevait l'URL de l'appelant **sans aucun contrôle** ; deux abus fermés par deux contrôles différents : métadonnées cloud (SSRF aveugle, la requête part même si le clone échoue) et **`file:///etc`** (lecture de fichiers déguisée en dépôt — seul le contrôle de **protocole** l'attrape). **Webhook SIEM ✅** — le code refusait déjà de suivre les redirections mais son commentaire énonçait le vrai trou : l'URL « is validated only at config time » ; **le DNS n'est pas de la configuration**, d'où la **re-résolution à chaque livraison**. Mode explicite `allowAnyPublicHost` (lève l'allowlist d'hôtes, **jamais** les contrôles d'adresse ; inatteignable par oubli de configuration). Refus **journalisé** : refuser en silence aurait fait disparaître la télémétrie de sécurité lors d'une panne DNS. **4 contre-épreuves supplémentaires**, 9 tests pilotant le **vrai** chemin de livraison. **Reste ❌ le rebinding TOCTOU complet** (exigerait d'épingler l'IP jusqu'à la socket). | SEC | TOCTOU complet hors de portée |
| AUDX-007 | **PAT GitHub/GitLab/Vercel/Netlify/Supabase** stockés dans `localStorage` | P0 | **🟠 PARTIEL — 5 des 5 ne persistent plus le secret, PR #363 + #373** | **5 stores** persistent toujours le PAT : `github.ts`, `gitlabConnection.ts`, `netlify.ts`, `supabase.ts`, `vercel.ts`. ⚠️ **Découverte qui change le plan** : l'architecture serveur **existe déjà** — `UserConnection.accessTokenEncrypted` + service `connector-proxy`. Le correctif n'est donc PAS « construire un coffre » mais **migrer ces 5 stores sur l'existant** : chantier à part, pas un patch. **Fait dans #363** : suppression de `githubConnection.ts` (**code mort, 0 importeur**, qui persistait un PAT pour rien) + **cliquet de test** figeant la liste des 5 — une nouvelle store qui persiste un jeton échoue. **La dette ne grossit plus.** ⚠️ Le cliquet a été **faux deux fois** : il lisait `process.cwd()/../..` (donc **le checkout principal** depuis un worktree) et son motif ratait un objet en une ligne — la contre-épreuve **ne mordait pas**. Refait, contre-éprouvé **dans les deux sens**. **Fait dans #373** : **Vercel migré de bout en bout** — montée unique du jeton vers `POST /api/integrations/api-key/vercel/configure` (stocké **chiffré**), effacement local **uniquement sur succès confirmé**, et le store cesse d'écrire le jeton (la moitié non secrète reste en cache pour ne pas vider le panneau). ⚠️ **L'ordre est tout le design** : effacer avant de confirmer perdrait la connexion dès que la montée échoue — **perte de données** déguisée en correctif ; la contre-épreuve inverse l'ordre pour le prouver. ⚠️ **AUDX-163 appliqué à moi-même** : helper dans `app/lib/connections/serverConnections.ts`, module partagé et nommé — et j'en ai **retiré** un `listServerConnections` pointant vers une route Remix **inexistante**, plutôt que de livrer une primitive cassée. **Complété le 02/09 — les 5 fournisseurs** cessent d'écrire leur secret. ⚠️ **Supabase en portait DEUX** : le `token` de management **et** `credentials` (la clé anon du projet), écrite sous une clé nommée `supabaseCredentials` — les deux retirées. Retrait fait par **un** helper partagé (`persistConnectionWithoutSecrets`) et une table unique des champs secrets, plutôt que trois lignes recopiées aux **huit** sites d'écriture : « chaque store retire-t-il bien son jeton ? » se répond par un grep (**AUDX-163**). ⚠️ **Les tests pilotent les vraies fonctions de mise à jour**, pas le helper — le mécanisme correct ne prouve rien si un site d'appel l'oublie — et assertent sur **tout** le contenu persisté, quelle que soit la clé. **5 contre-épreuves**, une par store plus le helper. **Reste** : le **routage des appels** par `connector-proxy` (non entamé) et la migration du jeton **existant**, câblée pour Vercel seulement. | SEC / FE | Routage connector-proxy restant |
| AUDX-008 | **Bearer admin** stocké dans le navigateur | P0 | **✅ CORRIGÉ — PR #363 (ouverte)** | ⚠️ **Mon premier passage l'avait déclaré introuvable — c'était une erreur de recherche, pas une absence.** Il était dans `apps/admin/src/api.ts` (et non `apps/admin/app/`) : `localStorage['vibecore_admin_token']`, un identifiant **admin plateforme pleins privilèges**, lisible par tout script de l'origine, **persistant**. **Il était redondant** : `/auth/login` pose déjà le cookie httpOnly, les appels envoient déjà `credentials: 'include'`, et `bearerToken()` retombe déjà sur `request.cookies.session`. Supprimé ; le collage manuel reste **en mémoire** pour l'onglet. ⚠️ **Deux pièges traités, sans quoi l'admin cassait** : sans en-tête `Authorization` l'API exige un **CSRF** sur les mutations (403 sur chaque écriture) → `x-csrf-token` ajouté ; et l'état « connecté » se lit désormais du **serveur** (`/auth/me`), sinon retirer le storage déconnectait tout le monde au rechargement (**règle 19**). **6 contre-épreuves**, 8 tests, build admin vert (⚠️ il échouait au premier essai — mon `echo` suivait `tail`, pas `tsc`), parité lint exacte. | SEC | — |
| AUDX-009 | **API keys trop générales**, sans binding organisation/projet | P1 | NON_COMMENCÉ | — | SEC | — |
| AUDX-010 | **Chiffrement global non versionné**, sans rotation ni `keyId` | P1 | **✅ CORRIGÉ — PR #398 (ouverte)** | `packages/security/src/index.ts:105` : clé unique `CONFIG_ENCRYPTION_KEY` (défaut `dev-config-encryption-key-change-me`, refus en production l.108-110). **Aucun `keyId` / `keyVersion`** dans `packages/security/src` → aucun chiffré ne porte l'identité de la clé, donc **aucune rotation possible sans réécrire tout le corpus**. | SEC | Rotation elle-même = AUDX-137 (AVI) |
| AUDX-011 | **Audit présenté comme immuable** alors qu'il est modifiable/supprimable | P1 | **✅ CORRIGÉ — PR #399 (ouverte)** | `packages/database/prisma/schema.prisma:838` `model AuditLog` — table Prisma ordinaire : **aucun trigger, aucune RULE, aucun REVOKE** dans les migrations. Le schéma **affirme pourtant l'immuabilité** en commentaire (l.858-861 : « DERIVED from immutable AuditLog rows … without mutating the append-only audit trail »). L'immuabilité est **documentée mais non appliquée** — c'est précisément l'écart signalé. | SEC | — |
| AUDX-012 | **Séparation des secrets et rôles DB par service** dans Helm/Terraform | P1 | **🟠 PARTIEL — PR #401 (ouverte)** | **Mesure : 31 secrets × 8 services.** `templates/deployments.yaml` boucle sur TOUS les services et montait la même Secret complète via `envFrom` — `screenshotter` (navigateur headless rendant des pages utilisateur non fiables) portait `STRIPE_SECRET_KEY`, les 6 clés IA, `JWT_SECRET`, `DATABASE_URL`, `CONFIG_ENCRYPTION_KEY`. **Après (rendu Helm)** : screenshotter 31→**0**, preview-proxy 31→**2**, workspace-manager 31→**4**, worker 31→**5**, ai-gateway 31→**9**. **Reste ❌** : (a) `api`/`web`/`admin` restent à 31 — l'api résout les secrets OAuth par nom CALCULÉ (`process.env[\`${provider.toUpperCase()}_CLIENT_SECRET\`]`, app.ts:5414), invisible à une liste par grep ; les scoper exige d'abord de rendre ces accès explicites. (b) **Rôles DB — mécanisme livré PR #420** : `services.<svc>.databaseUrlSecretKey` (inerte par défaut) + matrice mesurée. **Mesure : api 107 tables sur 125, worker 7, ai-gateway 6, connector-proxy 6, `workspace-manager` UNE** — et ce dernier peut lire `User.passwordHash`, `Session` et chaque colonne `*Enc`. ⚠️ Le SQL de GRANT est **généré pour relecture, marqué NE PAS APPLIQUER** : dérivé d'une analyse statique, un accès non vu devient un GRANT manquant donc une panne. La création des rôles est une opération Cloud SQL. | SEC / RT | — |
| AUDX-013 | **Tests adversariaux inter-tenant** | P1 | **✅ CORRIGÉ — PR #418 (ouverte)** | Prérequis de clôture de AUDX-001→008 : sans jeu adversarial, « corrigé » ne sera pas prouvable. ⚠️ **Un jeu adversarial existant aurait attrapé AUDX-022** : un jeton de projet A demandant la destruction du seau de A en lecture seule renvoyait 200. Le trou n'était pas inter-**tenant** mais inter-**verbe** — la matrice adversariale doit croiser (locataire × projet × VERBE), pas seulement (locataire × projet). | SEC | — |

---

## 2. Backend, données, facturation — AUDX-014 → AUDX-035

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-014 | **Import durable multi-replica** : staging partagé, idempotence DB, transitions CAS, compensation réelle | P0 | **✅ CORRIGÉ — PR #416 (ouverte)** | **Trois `Map` EN PROCESSUS** dans `services/api/src/app.ts` : `importStaging` (l.~8478), `importLedger` (`ImportCreditLedger`, en processus) et `importIdemIndex`. Le code l'admet lui-même : « *A multi-replica prod would back this with a shared ephemeral store* ». **L'api tourne `replicas: 2`, HPA `maxReplicas: 6`** (values-prod). Le flux est en 2 sauts — `POST /orgs/:orgId/imports` écrit le staging (l.20122) puis `POST .../commit` le relit (l.20218) — et **il n'y a AUCUNE affinité de session sur l'api** : l'Ingress à cookie (`vc_upstream`) ne couvre que `/` (web) et `/runtime`, l'api est jointe par le **Service ClusterIP** (`SAAS_API_URL`), sans `sessionAffinity` ⇒ round-robin kube-proxy. **⇒ ~50 % des imports échouent au commit à 2 replicas (~83 % à 6)**, en `409 IMPORT_STAGING_GONE`. ✅ Bon point : le commit **échoue fermé**, il ne valide pas un import vide — pas de perte de données par ce chemin. ❌ En revanche la **réservation de crédits est orpheline** : `reserve()` s'exécute sur le pod A, `compensateByJob()` sur le pod B ne trouve rien (`keyByJob` est local) ⇒ crédits retenus sans compensation ; un redémarrage de pod perd toutes les réservations en vol. **Correctif = chantier** : staging + registre partagés (Redis/Postgres) + idempotence en base. Non entamé, délibérément : à moitié fait, ce serait pire. | BE | — |
| AUDX-015 | Suppression des **projets fantômes** après échec d'import | P1 | **✅ CORRIGÉ — PR #416 (ouverte)** | Le chemin d'import principal **ne crée pas** de projet fantôme : `targetProjectId` est documenté « *Set only at COMMITTED* » et le commit **échoue fermé** en `409 IMPORT_STAGING_GONE` quand le staging manque (voir AUDX-014) — aucun projet n'est monté. Ce qui reste ouvert est donc **plus étroit que l'énoncé** : les échecs APRÈS montage du projet (le commit avance par transitions puis échoue), et le nettoyage des `ImportJob` restés en état non terminal. À reformuler sur cette base plutôt que sur « projets fantômes » en général. | BE | — |
| AUDX-016 | **Metering IA dont l'AI Gateway est seule autorité** | P0 | NON_COMMENCÉ | **Bloqué par une dépendance identifiée** : l'appel LLM ne passe pas encore par l'ai-gateway — note `C1.b.4` dans `app/lib/.server/ai-usage.ts`. Le gateway **calcule déjà** `AiUsage` (`inputTokens`/`outputTokens`/coût) mais **ne le rapporte pas** ; c'est le web tier qui déclare. Tant que ce reroutage n'est pas fait, aucune autorité serveur n'est possible — d'où le repli **provenance** d'AUDX-017. | BILL | Prérequis : reroutage C1.b.4 |
| AUDX-017 | Suppression de **`/ai/record-usage`** comme source de tokens **déclarés par le client** | P0 | **🟠 PARTIEL — PR #365 (ouverte)** | **Défaut confirmé** : route **authentifiée par session** écrivant des lignes de **facturation** depuis `inputTokens`/`outputTokens` pris tels quels du corps ⇒ quiconque a une session poste `inputTokens: 0`, ou n'appelle jamais la route. `ai-pricing.ts:221` le documentait déjà (validation de **forme**, pas de **vérité**). ⚠️ **Pourquoi la suppression pure est impossible aujourd'hui** : l'appel LLM **ne passe pas** par l'ai-gateway (note `C1.b.4`), donc les comptes **ne peuvent pas être recalculés** côté API. **Livré** : traçabilité de **provenance** — `AiCostLedger.source` (**migration 0085** + index de réconciliation) ; rapport portant le secret interne = `trusted`, tout le reste = `declared`, **écrit mais marqué**. Les lignes existantes retombent sur `declared` — description honnête de leur production. ⚠️ **Piège attrapé avant livraison** : la 1re version lisait l'en-tête `Authorization`, **déjà consommé par la session** ⇒ le chemin `trusted` aurait été **INATTEIGNABLE** (401 au preHandler) et le mécanisme **décoratif**. En-tête distinct + **test de reachability** (contre-épreuve CE-2). ⚠️ Piège SSR évité : `process.env` shimé à `{}` ⇒ lecture via `globalThis`. ⚠️ **Règle 19** : une ligne non prouvable est **quand même écrite**. **5 contre-épreuves**, 5 tests, build `tsc` strict vert, parité lint exacte. **Reste** : rend la sous-déclaration **visible et réconciliable**, **pas impossible**. | BILL | Fermeture réelle = AUDX-016 (reroutage C1.b.4) |
| AUDX-018 | **Réservation atomique de crédits AVANT** appel fournisseur | P0 | **✅ CORRIGÉ — PR #368 (ouverte)** | **Défaut** : le metering débite au **rapport**, donc **après** la dépense ⇒ (a) un rapport qui n'arrive jamais = IA gratuite, (b) N appels concurrents franchissent le **même** pré-contrôle et dépassent le solde. **Correctif** : hold pris par un **UPDATE conditionnel en une seule instruction** (`balanceCents - heldCents >= $amount`) — le nombre de lignes affectées **est** la réponse, aucune lecture ne le précède. Prisma ne comparant pas deux colonnes en `updateMany`, c'est du SQL paramétré. **Migration 0086** (`heldCents` + `CreditReservation`), cycle HELD → SETTLED / RELEASED / EXPIRED. ⚠️ **3 façons de perdre de l'argent, fermées séparément** : libération **non conditionnelle** (settle en course avec le balayage ⇒ crédits rendus **deux fois**) ; hold **jamais soldé** (les crédits d'un projet actif fondent à chaque message ⇒ **la garde devient la panne**) ; hold **jamais réclamé** (requête plantée ⇒ crédits immobilisés à vie). ⚠️ **Règle 19 — condition de livrabilité** : **inerte** tant que `BILLING_CREDITS_ENABLED !== 'true'`. Les crédits sont **~90 % SHADOW** ; un hold sur portefeuille dormant **refuserait chaque chat**. Test d'inertie écrit **avant** le mécanisme. **6 contre-épreuves** dont la **TOCTOU** (10 appelants, 5 places), 14 tests, build `tsc` strict vert, parité lint exacte. **Reste** : le hold n'est pas relié à `debitCredits` — une seule voie de débit conservée. Empêche le **dépassement**, ne remplace pas la **comptabilité**. | BILL | — |
| AUDX-019 | **Ledger idempotent et outbox** pour Stripe/PAYG | P0 | NON_COMMENCÉ | `model StripeEvent` existe (`schema.prisma:1018`) — déduplication d'événements entrants — mais **aucun modèle Outbox** (`grep "model.*Outbox"` → 0). Le sens manquant est le **sortant** : pas de publication transactionnelle. | BILL | — |
| AUDX-020 | **Quotas de stockage AVANT** émission d'une URL signée | P1 | **✅ CORRIGÉ — PR #414 (ouverte)** | `POST /object-storage/objects/upload-url` → `createUploadUrl` : **aucun contrôle de quota**, d'aucune sorte. Et il ne peut pas y en avoir tant qu'AUDX-023 tient : l'usage réel du seau GCS n'est **jamais mesuré** (voir AUDX-023), donc rien à comparer à un quota. Dépend d'AUDX-023, lui-même dépendant d'AUDX-024 (livré, PR #400 — `listAllObjects` est la primitive manquante). | BE | — |
| AUDX-021 | Limites **taille / checksum / génération** des uploads | P1 | **✅ CORRIGÉ — PR #403 (ouverte, empilée sur #402)** | **Mesure** : `createUploadUrl` signait une URL v4 ne liant QUE `Content-Type` — ni plafond de taille, ni empreinte. L'URL signée est utilisée **directement** contre GCS : l'api ne voit jamais les octets, donc aucune limite côté serveur ne pouvait s'appliquer. Correctif : `x-goog-content-length-range` **signé dans l'URL** (plafond `OBJECT_STORAGE_MAX_UPLOAD_BYTES`, 512 Mio par défaut) et `Content-MD5` optionnel lié à la signature — GCS refuse le PUT si l'en-tête manque ou diffère. Un appelant peut demander MOINS, jamais plus (clamp). **Reste ❌** : la contrainte de **génération** (`ifGenerationMatch`), non traitée. | BE | — |
| AUDX-022 | **Tokens stockage courts**, séparés read/write/delete/admin | P1 | **✅ CORRIGÉ — PR #402 (ouverte, empilée sur #400)** | ⚠️ **Plus grave que l'énoncé.** `requireObjectStorageProject(request, permission)` prenait une permission et l'**IGNORAIT** dès qu'un jeton d'espace de travail était présent (app.ts, chemin `objectStorageGrant`), et la charge utile du jeton ne portait **aucun champ de portée**. Mesuré : avec un jeton **lecture seule**, `DELETE /object-storage/objects` → **200** et `DELETE /object-storage/bucket` → **200**. Ce jeton est injecté dans le pod d'espace de travail, qui exécute du **code écrit par l'utilisateur**. Correctif : claim `scopes`, vérification par route (read/write/delete/admin), émission en `['read','write']`, jetons legacy réduits à read+write. | SEC / BE | — |
| AUDX-023 | **Inventaire et metering réels** des objets GCS | P1 | **✅ CORRIGÉ — PR #414 (ouverte)** | ⚠️ **`services/worker/src/object-storage-metering.ts` N'EXISTE PAS** — seul le `.spec.ts` existe, et il teste un simple déclencheur HTTP. **Le comptage n'est PAS réel** : `meterAllObjectStorage` → `store.aggregateStorageBytesByOrg()` → `prisma.projectStorageObject` — une table applicative dont la colonne est `contentBase64`, c'est-à-dire les **archives base64 stockées dans PostgreSQL**, écrites à **un seul endroit** (`persistProjectArchiveObject`, app.ts:15411, snapshots/exports). Les routes `/projects/:id/object-storage/*` (upload-url, move, delete) écrivent dans **GCS** et **ne touchent jamais** cette table. ⇒ **chaque octet téléversé via URL signée est invisible à la facturation ET à tout quota.** Le commentaire de la route affirme pourtant « *the numbers come straight from what's on disk* » (app.ts:29674) et celui de `meterAllObjectStorage` « *Sums the real stored bytes* » : les deux sont faux. La primitive manquante (`listAllObjects`) est livrée par la PR #400. | BE / BILL | — |
| AUDX-024 | **Pagination au-delà de 1 000 objets** | P1 | **✅ CORRIGÉ — PR #400 (ouverte)** | Plafond classique d'une page GCS : au-delà, l'inventaire de AUDX-023 est silencieusement tronqué. | BE | — |
| AUDX-025 | **État durable** des backups et restores PostgreSQL | P0 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-026 | **Cutover atomique** vers la base restaurée | P0 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-027 | **Validation par données sentinelles** et **rollback du cutover** | P0 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-028 | Suppression / réconciliation des **bases CNPG orphelines** | P1 | NON_COMMENCÉ | — | RT / BE | — |
| AUDX-029 | **Arrêt gracieux de l'API** lors des rollouts | P1 | **PARTIEL** | Le zéro-downtime plateforme est actif depuis `5c2c3586` (`maxUnavailable: 0` + `preStop` sur tous les Deployments, cf. `CLAUDE.md`). Reste le volet **applicatif** : drain des requêtes en vol et des jobs côté API, non vérifié. | BE / RT | — |
| AUDX-030 | **Séparation des workers et files par SLA**, avec **DLQ** et métriques | P1 | NON_COMMENCÉ | — | BE | — |
| AUDX-031 | Sortie des **ZIP/base64 hors de PostgreSQL** vers un blob store | P1 | NON_COMMENCÉ | Lié à AUDX-048 (ZIP en RAM) : même corpus, deux symptômes. | BE | — |
| AUDX-032 | **Rétention, GC et suppression** des snapshots/exports | P1 | NON_COMMENCÉ | Politique de rétention = **décision d'Avi** (D-03) ; le **mécanisme** reste à écrire quelle que soit la valeur retenue. | BE | D-03 |
| AUDX-033 | L'état **FAILED**, les **causes d'échec** et le **nettoyage des ressources orphelines** ne sont **pas** couverts par le correctif DB récent | P1 | NON_COMMENCÉ | Vérifié : le dernier correctif DB sur `main` est `9b59b3489` « un provisionnement bloqué n'enferme plus le projet à vie (#342) » — il **débloque** le projet, il ne modélise ni la cause d'échec ni le nettoyage des ressources déjà créées. La réserve de l'audit est **exacte**. | BE | — |
| AUDX-034 | Le panneau base de données a **5 instances ACTIVE invisibles** en production (BUG-DB-002) — vérifier l'état réel du correctif | P0 | **DÉJÀ_FAIT (correctif fusionné)** | PR **#317 est MERGÉE** : `mergedAt 2026-09-01T09:07:28Z`, merge commit `43336cb1e70d3dd519412b2f4d14309200a4fbd6`, présent sur `origin/main`. ⚠️ `BUG_INVENTORY_LIVE.md:265` sur `main` la décrit encore comme « **PR #317 (non mergé)** » → **correction de suivi requise** (AUDX-152). La preuve « créer une base depuis l'IHM et la voir » exige en outre le **déploiement**, non couvert par la fusion. | BE / GOV | — |
| AUDX-035 | Le correctif #317 rend **visibles** 2 instances `PROVISIONING` sans secret (BUG-DB-001, défaut d'infra distinct) | P1 | NON_COMMENCÉ | Défaut d'infra séparé, que #317 expose au lieu de le masquer derrière l'état vide. | RT / BE | — |

---

## 3. Collaboration et perte de fichiers — AUDX-036 → AUDX-044

> **Décision D-04 : CAS avec conflits explicites, PAS de CRDT temps réel pour l'instant.**
> Toute proposition CRDT sur ces lignes est hors cadre.

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-036 | Remplacer le **« dernier write gagne »** | P0 | NON_COMMENCÉ | Cause racine de la perte de fichiers : sans révision, deux écritures concurrentes se recouvrent silencieusement. | BE / FE | D-04 |
| AUDX-037 | **Révisions / CAS obligatoires** | P0 | NON_COMMENCÉ | « Obligatoires » = refus par défaut d'une écriture sans révision, pas une option. | BE | D-04 |
| AUDX-038 | **Journal durable par document** | P0 | NON_COMMENCÉ | — | BE | D-04 |
| AUDX-039 | **Application réelle** des événements `document.sync` | P0 | NON_COMMENCÉ | L'événement existe mais n'est pas appliqué : le canal donne l'illusion d'une synchronisation. | BE / FE | D-04 |
| AUDX-040 | **Gestion des conflits dans Monaco** | P1 | NON_COMMENCÉ | Cf. la référence Replit : le merge editor affiche des **marqueurs bruts**. | FE | D-04 |
| AUDX-041 | **Rebase ou merge explicite** entre utilisateur et Agent | P0 | NON_COMMENCÉ | C'est le cas le plus fréquent de perte : l'Agent écrit pendant que l'utilisateur édite. | BE / FE | D-04 |
| AUDX-042 | **Reprise offline / reconnexion** | P1 | NON_COMMENCÉ | — | FE | D-04 |
| AUDX-043 | **Tests simultanés** : deux navigateurs + un Agent | P1 | NON_COMMENCÉ | Condition de clôture de AUDX-036→042 : sans ce test, « corrigé » n'est pas démontrable. | REL / FE | D-04 |
| AUDX-044 | **Protection des checkpoints pendant TOUTES les mutations**, pas seulement deux routes | P0 | NON_COMMENCÉ | ⚠️ Forme de défaut déjà rencontrée ici : le mécanisme est bon, c'est le **site d'appel** qui est incomplet. Vérifier **chaque** route mutante, pas le helper. | BE | D-04 |

---

## 4. Snapshots et checkpoints — AUDX-045 → AUDX-055

> **Décision D-05 : un checkpoint couvre fichiers + base PostgreSQL.**

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-045 | **Restore runtime qui renvoie 204 en restaurant zéro fichier** | P0 | NON_COMMENCÉ | Succès menteur : le pire mode d'échec, l'utilisateur croit être restauré. | BE / RT | D-05 |
| AUDX-046 | **Snapshots WebContainer seulement en mémoire** | P0 | NON_COMMENCÉ | Un rechargement d'onglet perd le snapshot. | FE | D-05 |
| AUDX-047 | **Persistance des fichiers binaires** | P1 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-048 | **Checkpoints qui oublient l'archive durable** | P0 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-049 | **Archives créées AVANT le contrôle du quota** | P1 | NON_COMMENCÉ | Ordre inversé : le quota doit précéder l'écriture. Même famille que AUDX-020. | BE | D-05 |
| AUDX-050 | **ZIP entièrement chargés en RAM** | P1 | NON_COMMENCÉ | Lié à AUDX-031. | BE | D-05 |
| AUDX-051 | **Restore qui efface le projet puis réécrit fichier par fichier** | P0 | NON_COMMENCÉ | Fenêtre destructrice : une interruption en cours laisse le projet **vide**. Résolu par AUDX-053 (staging + swap). ⚠️ Rappel : un correctif antérieur (reopen, 13/07) portait exactement ce motif — « fetch+validate AVANT de vider ». | BE | D-05 |
| AUDX-052 | **Erreurs de synchronisation vers le pod avalées** | P0 | NON_COMMENCÉ | Cause directe de AUDX-045 : l'erreur est mangée, le 204 part quand même. | BE / RT | D-05 |
| AUDX-053 | **Staging puis swap atomique** | P0 | NON_COMMENCÉ | Correctif structurel de AUDX-051. | BE | D-05 |
| AUDX-054 | Statuts **RESTORING / COMMITTED / FAILED** | P1 | NON_COMMENCÉ | — | BE | D-05 |
| AUDX-055 | **Réconciliation après crash** | P1 | NON_COMMENCÉ | — | BE | D-05 |

---

## 5. Scheduler — AUDX-056 → AUDX-066

> **Décision D-06 : après une panne, rejouer UNE seule occurrence manquée, jamais toutes.**

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-056 | **Claim et création de run non atomiques** | P0 | NON_COMMENCÉ | Cause racine de AUDX-059 (double exécution). | BE | — |
| AUDX-057 | **Déclenchement perdu en cas de crash** | P0 | NON_COMMENCÉ | — | BE | D-06 |
| AUDX-058 | **Compteur de retries qui repart à 1 et boucle** | P0 | NON_COMMENCÉ | Boucle infinie de réessais : consomme du budget IA et du runtime sans fin. | BE | — |
| AUDX-059 | **Double exécution possible avec FORBID** | P0 | **PARTIEL** | La politique existe : `services/api/src/scheduled-tasks.ts:290` (« No-overlap (concurrency=FORBID): a previous run still RUNNING means … »), l.306 message de saut. **Mais le code lui-même documente sa faille** l.562 : un run « stuck RUNNING forever … would also block the FORBID overlap guard ». La garde est un **read-then-check** non atomique (AUDX-056) : deux replicas peuvent lire « pas de run » simultanément. | BE | — |
| AUDX-060 | **Annulation qui marque CANCELED mais laisse le pod tourner** | P0 | NON_COMMENCÉ | Fuite de ressources **et** de coût : facturé sans être visible. | RT / BE | — |
| AUDX-061 | **`AbortController` jamais transmis au processus** | P1 | NON_COMMENCÉ | Cause directe de AUDX-060. | BE | — |
| AUDX-062 | **Metering scheduler fail-open** | P0 | NON_COMMENCÉ | Fail-open sur du metering = exécution gratuite non comptée. Même classe que AUDX-016/017. | BILL | — |
| AUDX-063 | **Historique supprimé en cascade** avec la tâche | P1 | NON_COMMENCÉ | Perte de traçabilité **et** de preuve de facturation. | BE | — |
| AUDX-064 | **Pods et Secrets Kubernetes orphelins** | P1 | NON_COMMENCÉ | — | RT | — |
| AUDX-065 | **Exécution multi-replica** avec **leases et idempotence** | P0 | NON_COMMENCÉ | Correctif structurel de AUDX-056/059. | BE | — |
| AUDX-066 | **Réconciliation périodique par labels Kubernetes** | P1 | NON_COMMENCÉ | Correctif de AUDX-064. | RT | — |

---

## 6. Runtime, gVisor, Nix, déploiements — AUDX-067 → AUDX-082

> **Décisions D-07 (pool gVisor dans le même cluster), D-08 (second cluster Terraform à
> vérifier puis supprimer si inutilisé), D-09 (`ecode.lock` auto-généré mais obligatoire),
> D-10 (Firecracker reporté).**

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-067 | **NetworkPolicies correctes** pour workspace / build / scheduled / server | P0 | **PARTIEL** | Existant et solide côté workspace : `infra/kubernetes/workspaces-runtime/networkpolicies.yaml` (default-deny + egress 443 seul, `except` sur `169.254.169.254/32` **et** tout le RFC1918) et `infra/helm/platform/templates/networkpolicy.yaml` (deny-all + intra-ns + runtime + DB/Redis). **Trous confirmés** : (a) `allow-platform-required-egress` a un `podSelector: {}` qui **ré-ouvre 443 à tout pod** et annule par union toute politique plus stricte — le fichier l'admet pour le screenshotter ; (b) rien de dédié pour **build / scheduled / server-deploy** hormis un `Exists` large sur `vibecore.ai/server-deploy` **tous ports**. | RT | D-07 |
| AUDX-068 | **Politique d'admission unique et cohérente** | P1 | **PARTIEL** | `infra/kubernetes/admission-policies/workspace-restricted-policies.yaml` + `infra/kubernetes/podsecurity/namespaces.yaml` + Kyverno **en mode AUDIT** (jamais passé en Enforce). Deux mécanismes coexistent → « unique et cohérente » n'est pas tenu. | RT | — |
| AUDX-069 | **Interdiction du kill switch gVisor en production** | P0 | NON_COMMENCÉ | `runtimeClassName: gvisor` est **exigé** par `infra/scripts/validate.mjs` sur les deux manifestes d'exemple, mais aucun garde-fou n'empêche de le **désactiver** au niveau values/manager en production. | RT | D-07 |
| AUDX-070 | Limites **ephemeral-storage, /tmp, PID, inodes, fichiers ouverts** | P1 | **PARTIEL** | Seul `ephemeral-storage` est traité, et **côté plateforme** : `infra/helm/platform/templates/deployments.yaml:204` (« Cap node ephemeral-storage usage so a runaway write to /tmp can't … »). **Rien** pour PID / inodes / fichiers ouverts, et rien côté **workspace locataire** — qui est justement la surface hostile. | RT | D-01 |
| AUDX-071 | **Montage Nix dans les tâches planifiées** | P1 | NON_COMMENCÉ | — | RT | D-09 |
| AUDX-072 | **Propagation de `nixGenerationRef`** sur dev / preview / build / publish / scheduled | P1 | **PARTIEL** | La référence existe et circule : `services/workspace-manager/src/manager.ts`, `services/api/src/server-deploy-revision.ts`, `services/api/src/release-rollback.ts`, `packages/k8s-client/src/nix-generations.ts`. ⚠️ Même forme de risque que AUDX-044 : la **propagation par site d'appel** (les 5 chemins nommés) n'est pas démontrée — à vérifier chemin par chemin. | RT | D-09 |
| AUDX-073 | **Respect strict d'`ecode.lock`** | P1 | **PARTIEL** | Machinerie présente et testée : `packages/k8s-client/src/ecode-lock.ts` + `ecode-lock.spec.ts`, `nix-placement.spec.ts`. Reste : « strict » = **refus** en l'absence de lock, une fois le lock généré (D-09). | RT | **D-09** |
| AUDX-074 | **Rejet d'une génération Nix inconnue ou révoquée** | P1 | **DÉJÀ_FAIT (mécanisme)** | `packages/k8s-client/src/nix-generations.ts` : `type NixGenerationStatus = 'ACTIVE' \| 'RETIRED' \| 'REVOKED'` (l.26) ; codes d'erreur `NIX_GENERATION_REVOKED` et `NIX_GENERATION_NONE_ACTIVE` (l.80-81) ; invariants documentés l.98-100 (« AT MOST one ACTIVE », « REVOKED requires revokedAt + revokedReason »). ⚠️ Le **mécanisme** est fait ; son **application à tous les sites d'appel** relève de AUDX-072. | RT | — |
| AUDX-075 | **PATH déterministe** limité aux bundles autorisés | P1 | NON_COMMENCÉ | — | RT | — |
| AUDX-076 | **Première version déployée par digest** et non par tag | P1 | NON_COMMENCÉ | Le rollback par digest existe déjà (13/07, 17/07) ; c'est le **premier** déploiement qui reste sur tag. | REL / RT | — |
| AUDX-077 | **Capture automatique d'une révision immuable** | P1 | NON_COMMENCÉ | — | REL | — |
| AUDX-078 | **HPA / KEDA** workers et applications | P2 | NON_COMMENCÉ | Vague 5. | RT | D-01 |
| AUDX-079 | **Compteur autoscale durable** plutôt qu'une annotation Kubernetes | P2 | NON_COMMENCÉ | Une annotation n'est ni transactionnelle ni durable : perdue au recreate du pod. | RT | — |
| AUDX-080 | **Pipeline statique vers object storage + CDN** | P2 | NON_COMMENCÉ | Aujourd'hui l'ingress est en **DNS direct, sans CDN** (LB `34.1.6.93`, cf. `CLAUDE.md`). | RT | — |
| AUDX-081 | **Gestion Terraform du stockage** aujourd'hui manuel | P2 | NON_COMMENCÉ | ⚠️ `terraform apply` exige Avi (SA TF + bucket réel) — la CI est **plan-only**. | RT | AVI |
| AUDX-082 | **Vérifier si le second cluster Terraform est réellement inutilisé, et le supprimer si oui** (coût inutile) | P2 | NON_COMMENCÉ | `infra/terraform/envs/{staging,prod}` existent tous deux. **Vérification d'usage réel = accès GCP (hors dépôt)**. ⚠️ Suppression d'infra = action destructrice → **Avi uniquement**. | AVI / RT | **D-08** |

---

## 7. CI/CD et chaîne d'approvisionnement — AUDX-083 → AUDX-102

> **Décision D-16 : le gate exact-SHA et ses tests internes sont jugés corrects — ne pas les casser.**

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-083 | **`infra/scripts/validate.mjs` échoue sur deux NetworkPolicies absentes** — *seul échec réel de la passe* | P0 | **TRAITÉ DANS CETTE PR** | Reproduit sur `main` : `node infra/scripts/validate.mjs` → `Missing required infra path: kubernetes/networkpolicies/workspaces-deny-default.yaml`. ⚠️ **La remédiation évidente est un piège** : ces deux fichiers ont été supprimés **volontairement** par `6589338b8` (« remove colliding standalone NetworkPolicies ») parce qu'ils portaient les **mêmes noms** que les objets Helm et, appliqués **après** Helm, **écrasaient l'egress plus strict — ils ré-ouvraient le port 80 depuis les sandboxes** (`git show 6589338b8^:…/workspaces-deny-default.yaml` : `port: 80` présent, absent du manifeste actuel). **Les recréer serait une régression de sécurité.** Correctif retenu : le validateur pointe sur les **sources survivantes** et vérifie les mêmes garanties (default-deny, sélecteur ingress-nginx), en **ajoutant** une assertion « pas de port 80 en egress workspace » qui interdit le retour de la régression. **Fait** : `infra/scripts/validate.mjs` → `infra scaffold valid`. **Contre-épreuves (4 mécanismes cassés séparément, 4 erreurs distinctes)** : (1) réintroduire `port: 80` → *Unexpected workspace egress port(s) 80* ; (2) renommer `workspace-default-deny` → *Missing workspaces default-deny NetworkPolicy* ; (3) renommer `deny-all-default` → *Missing platform default-deny NetworkPolicy* ; (4) supprimer tous les ports egress → *No egress ports found … the guard would pass vacuously* (garde anti-vacuité). ⚠️ La garde est scopée au **document YAML** de la policy egress : le fichier porte aussi une policy d'INGRESS dont les `:8080` sont légitimes. | REL / RT | — |
| AUDX-084 | **`platform:verify` en gate obligatoire** | P0 | NON_COMMENCÉ | La cible existe (`package.json:19`) mais **n'est référencée par AUCUN workflow** (`grep -r "platform:verify" .github/workflows/` → 0). Elle enchaîne no-mocks, lint, test, typecheck, build **et `infra:validate`** — donc elle est **rouge aujourd'hui** à cause de AUDX-083 : c'est vraisemblablement la raison pour laquelle elle n'a jamais été câblée. Ordre imposé : **AUDX-083 d'abord**, AUDX-084 ensuite. | REL | — |
| AUDX-085 | **E2E `@runtime` en gate réel** | P0 | NON_COMMENCÉ | Aucun `@runtime` dans `.github/workflows/` ni `package.json`. | REL | — |
| AUDX-086 | Tests **preview/workspace sur runtime provisionné** | P1 | NON_COMMENCÉ | — | REL | — |
| AUDX-087 | **Audits dépendances bloquants** | P1 | NON_COMMENCÉ | — | REL | — |
| AUDX-088 | **axe, Lighthouse, dead-code, complexité, bundle-size bloquants** | P1 | NON_COMMENCÉ | — | REL / FE | — |
| AUDX-089 | **Pin de toutes les GitHub Actions par SHA** | P1 | NON_COMMENCÉ | Mesuré sur `main` : **1 sur 159** références `uses:` est épinglée par SHA 40 caractères (`amannn/action-semantic-pull-request@0723387f…`). Les 158 autres sont des tags mutables (`actions/checkout@v4`, `aquasecurity/trivy-action@0.35.0`, …). | REL | — |
| AUDX-090 | **Pin des images Docker et builders par digest** | P1 | NON_COMMENCÉ | — | REL | — |
| AUDX-091 | **`npm install` reproductible** pour `workspace-agent` | P1 | NON_COMMENCÉ | — | REL | — |
| AUDX-092 | **Checksums sur les binaires téléchargés** | P1 | NON_COMMENCÉ | Cas concret : `.github/workflows/security.yaml` télécharge gitleaks 8.21.2 par `curl … \| tar -xz` puis `sudo install` — **sans aucune vérification de somme**. Le *gate de secrets lui-même* est donc installé sans contrôle d'intégrité. | REL | — |
| AUDX-093 | **Gitleaks sur l'historique complet** | P1 | NON_COMMENCÉ | Le job bloquant scanne `--no-git --source .` (`security.yaml`) : **arbre de travail uniquement**, sur un checkout **sans `fetch-depth: 0`**. Le commentaire l'assume (« catches NEW leaks … without re-litigating already-removed history ») — mais un secret **déjà** dans l'historique n'est jamais vu. (Le `fetch-depth: 0` du fichier appartient au job **Trivy**, pas au job gitleaks.) | REL | — |
| AUDX-094 | **Resserrer les allowlists Gitleaks** | P1 | NON_COMMENCÉ | `.gitleaks.toml` présent. ⚠️ La CI épingle **8.21.2** : un gitleaks local plus récent renvoie d'autres findings/lignes et **fausse les fingerprints** `.gitleaksignore`. Resserrer **avec la version épinglée**, et générer les secrets de dev plutôt que les ignorer. | REL | — |
| AUDX-095 | **CodeQL et Trivy bloquants** | P1 | NON_COMMENCÉ | Les deux existent dans `security.yaml` mais publient en SARIF/artefact ; seul le job gitleaks est explicitement « blocking ». | REL | — |
| AUDX-096 | **Permissions GitHub Actions par job, deny-by-default** | P1 | NON_COMMENCÉ | Les `permissions:` sont aujourd'hui **au niveau workflow** (donc héritées par tous les jobs) — c'est la cause structurelle de AUDX-099. | REL | — |
| **AUDX-097** | 🔴 **URGENT — les workflows PR reçoivent les CLÉS IA** | **P0** | **TRAITÉ DANS CETTE PR (partiel — voir AUDX-137)** | **Constat** : `e2e.yml` injectait les quatre clés dans l'`env` du **job**, sur un workflow déclenché par `pull_request`. La garde anti-fork (l.33) ne couvre que les forks, et son propre commentaire **énonce le trou restant** : « same-repo PR branches run arbitrary code with the real prod keys injected ». **Fait ici, deux choses** : (a) les clés quittent l'`env` du job et sont rattachées **aux seuls 3 pas qui en ont besoin** (*Validate AI provider secret*, *Start API*, *Start web app*) — cela ferme le vecteur **chaîne d'approvisionnement** : `pnpm install --frozen-lockfile` exécutait des scripts de cycle de vie issus du lockfile de la PR **avec les clés en environnement**, sans qu'aucun test n'ait à s'exécuter ; (b) le job passe derrière `environment: pr-ai-secrets` sur `pull_request`. ⚠️ **Honnêteté sur (b)** : référencer un environment le **crée sans règle** — c'est le **crochet**, pas le contrôle. Tant qu'Avi n'a pas attaché « relecteurs requis » à `pr-ai-secrets` (**AUDX-137**), une PR de la même origine garde accès aux clés via les serveurs démarrés. ⚠️ Vérifié avant de déplacer : l'app web lit les clés **côté serveur** (`app/lib/.server/llm/provider-credentials.ts`) autant que l'API — les retirer du pas *Start web app* aurait **cassé le gate**. | REL / SEC | AUDX-137 = AVI |
| **AUDX-098** | 🔴 **URGENT — les builds Electron PR reçoivent les CERTIFICATS DE SIGNATURE** | **P0** | **TRAITÉ DANS CETTE PR** | `.github/workflows/electron.yml` : déclencheur `pull_request` (l.4) et `env` de job portant `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (l.48-54). **Aucune garde anti-fork** sur ce workflow. Une PR n'a aucun besoin de signer : un build PR doit être **non signé**. **Fait** : les 7 secrets deviennent `${{ github.event_name != 'pull_request' && secrets.X || '' }}` — vides sur PR, intacts sur tag/dispatch. ⚠️ Ajout nécessaire : `CSC_IDENTITY_AUTO_DISCOVERY: ${{ github.event_name != 'pull_request' }}` — sans lui, `CSC_LINK` vide fait chercher une identité **dans le trousseau du runner** et le build macOS de PR **échoue** au lieu de produire un binaire non signé. Le build PR continue donc de prouver ce qu'il doit prouver (ça compile et ça empaquette sur les 3 plateformes) : **aucun test affaibli**. | REL / SEC | — |
| **AUDX-099** | 🔴 **URGENT — le workflow Terraform PR conserve `id-token: write`** | **P0** | **TRAITÉ DANS CETTE PR** | `.github/workflows/terraform.yml:19` `id-token: write` (+ l.20 `pull-requests: write`) au **niveau workflow**, donc actif aussi sur `pull_request`, alors que l'étape d'authentification GCP est déjà `if: github.event_name != 'pull_request'`. Le jeton OIDC est donc **frappable depuis une PR** sans qu'aucune étape ne l'utilise — permission gratuite vers WIF. ⚠️ `permissions:` **n'accepte aucune expression** : on ne peut pas conditionner la permission, seulement le job qui la porte. **Fait** : le workflow est scindé — `validate` (fmt + `init -backend=false` + validate, `contents: read` **seul**, tourne sur PR) et `plan` (auth WIF + plan + upload, `id-token: write`, `if: github.event_name != 'pull_request'`). Workflow en **deny-by-default** (`contents: read`), et `pull-requests: write` — que rien n'utilisait — est supprimé. Sur une PR, **aucun jeton OIDC n'est atteignable**. Les checks statiques restent joués sur PR : **aucune couverture perdue**. | REL / SEC | — |
| AUDX-100 | **Dépendances `npx` non verrouillées** | P1 | NON_COMMENCÉ | Cas concret : `npx wait-on` dans `e2e.yml` — résolution non épinglée à l'exécution. | REL | — |
| AUDX-101 | **Tests WebKit/Safari et Firefox** | P1 | NON_COMMENCÉ | `playwright.config.ts` sur `main` ne déclare que **trois** projets : `chromium` (l.45), `tablet` (l.49), `mobile` (l.59). Aucun WebKit, aucun Firefox. | REL / FE | — |
| AUDX-102 | **Gates WCAG 2.2 AA** | P1 | NON_COMMENCÉ | Recoupe AUDX-088 (axe) et AUDX-106→110. | REL / FE | — |

---

## 8. Frontend, mobile/tablette, UX — AUDX-103 → AUDX-119

> **Décisions D-11 (menu bas mobile/tablette CONSERVÉ), D-12 (orange de marque NON changé),
> D-13 (les deux gros découpages sont REPORTÉS — trois sessions travaillent dans ces fichiers).**

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-103 | **Écrans coupés ou débordants** | P1 | NON_COMMENCÉ | Clôture = vérification **en réel** sur web / tablette / mobile (règle `CLAUDE.md`). | FE | D-11 |
| AUDX-104 | **Breakpoints CSS/JS contradictoires** | P1 | NON_COMMENCÉ | ⚠️ Symptôme déjà observé : **768 se comporte comme 390**. | FE | D-11 |
| AUDX-105 | **Cibles tactiles sous 44 px** | P1 | NON_COMMENCÉ | ⚠️ Cause racine déjà identifiée dans l'historique : **base rem redéfinie à 12/14 px** — corriger la base, pas les cibles une à une. | FE | D-11 |
| AUDX-106 | **Sheets et dialogs sans piège de focus** | P1 | NON_COMMENCÉ | Bloquant WCAG 2.2 AA (AUDX-102). | FE | — |
| AUDX-107 | **Swipe qui intercepte éditeur, terminal, diff** | P1 | NON_COMMENCÉ | ⚠️ Ne pas « corriger » en retirant le menu bas — **D-11**. | FE | **D-11** |
| AUDX-108 | **FileTree non accessible** | P1 | NON_COMMENCÉ | — | FE | — |
| AUDX-109 | **Terminal sans mode lecteur d'écran** | P1 | NON_COMMENCÉ | — | FE | — |
| AUDX-110 | **Séparateurs inutilisables au clavier** | P1 | NON_COMMENCÉ | — | FE | — |
| AUDX-111 | **Contrastes et erreurs de thème** | P1 | NON_COMMENCÉ | ⚠️ **47 défauts de contraste mesurés sur `main`** (sonde `audit/tint-contrast`, 01/09) — la sonde n'a **jamais été fusionnée**. Une famille de tokens `-on-tint` **existe déjà** : corriger la **façon de poser le texte** sur l'orange, pas l'orange (**D-12**). ⚠️ Méthode : l'ancêtre-walk DOM **ment** (calques frères absolus) — échantillonner les **pixels rendus**, différentiel light↔dark, surface la plus défavorable. | FE | **D-12** |
| AUDX-112 | **Traductions FR manquantes** | P1 | NON_COMMENCÉ | ⚠️ Le shard CI `Playwright mobile-390` (audit i18n live) est **rouge par timeout 90 min sur toutes les branches depuis ≥24/08** : il **ne donne plus aucun signal**. Ne pas s'appuyer dessus pour prouver la clôture. | FE | — |
| AUDX-113 | **États de chargement infinis** | P1 | NON_COMMENCÉ | — | FE | — |
| AUDX-114 | **Erreurs techniques affichées au client** | P1 | NON_COMMENCÉ | ⚠️ Risque de fuite prouvé sur ce dépôt : le texte d'amont d'une erreur base de données peut porter une **chaîne de connexion, donc un mot de passe** (rattrapé par le test i18n « masks raw list and provisioning errors » lors de #317). Copie d'échec à choisir sur le **code**, jamais sur le texte d'amont. | FE / SEC | — |
| AUDX-115 | **Profils / paramètres / surfaces encore sur `localStorage`** | P1 | NON_COMMENCÉ | `app/lib/stores/settings.ts` : `PROVIDER_SETTINGS_KEY`, `AUTO_ENABLED_KEY`, `SETTINGS_KEYS.*` tous en `localStorage`. Distinct de AUDX-007 (qui porte sur les **secrets**), même corpus. | FE | — |
| AUDX-116 | **Retrait du `@ts-nocheck` de `BaseChat.tsx`** | P1 | NON_COMMENCÉ | Présent en tête de fichier sur `main` : `// @ts-nocheck — Preventing TS checks. Must be a line comment, not a block, or tsc silently ignores the directive.` 23 745 lignes échappent au typage. | FE | Indépendant de D-13 |
| AUDX-117 | **Découpage progressif de `BaseChat.tsx`** (23 745 lignes) | P2 | **REPORTÉ (décision)** | `wc -l` sur `main` = **23 745** — chiffre de l'audit exact. | FE | **D-13 — reporté** |
| AUDX-118 | **Découpage de `services/api/src/app.ts`** (37 520 lignes) | P2 | **REPORTÉ (décision)** | `wc -l` sur `main` = **37 520** — chiffre de l'audit exact. | BE | **D-13 — reporté** |
| AUDX-119 | **Nettoyage des composants morts et de la dette CSS** | P2 | NON_COMMENCÉ | Cas avéré : `DatabasePanel` **n'est importé nulle part** — du travail serveur l'a ciblé alors que le composant rendu est `DatabaseWorkbench` (constat de BUG-DB-002 / #317). Le code mort ne coûte pas que de la place : il **absorbe des correctifs**. | FE | — |

---

## 9. Parité produit — AUDX-120 → AUDX-134

> **Décision D-15 : cible = parité fonctionnelle observable et datée, jamais la
> reproduction prétendue de systèmes internes propriétaires.** Chantier long, **planifié à part**.

| ID | Énoncé | Sév. | Statut | Preuve / reste à faire | Prop. | Arbitrage |
|---|---|---|---|---|---|---|
| AUDX-120 | **Tâches Agent persistantes et parallèles** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-121 | **Isolation par copie / micro-environnement** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-122 | **Task board, pause, reprise, cancel, apply diff** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-123 | **App Testing / automatisation navigateur** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-124 | **Collaboration multi-utilisateur** | P2 | NON_COMMENCÉ | Dépend de AUDX-036→044 (CAS). | PROD | D-04, D-15 |
| AUDX-125 | **Skills projet / utilisateur / organisation** | P2 | **PARTIEL** | Interop Agent Skills livrée et vérifiée en production (RPL-SK-001.1→.4, 31/07). Reste la **portée** projet/utilisateur/organisation. | PROD | D-15 |
| AUDX-126 | **Multi-artifacts** web / mobile / slides / data / media | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-127 | **Backend et secrets partagés entre artifacts** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-128 | **Design Canvas et annotations** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-129 | **Reserved VM, Autoscale 0..N, Static, Scheduled** | P2 | **PARTIEL** | `server-deploy` est LIVE (`d-<id>.preview.e-code.ai`) et le scheduled existe (AUDX-056→066). Reste Reserved VM et Autoscale 0..N (cf. AUDX-078/079). | PROD / RT | D-15 |
| AUDX-130 | **Profils publics, publication et remix** | P2 | **PARTIEL** | Remix + licence/PII livré et live (03/08). Reste profils publics et publication. | PROD | D-15 |
| AUDX-131 | **Imports Vercel / Figma / Claude aujourd'hui simulés** | P1 | NON_COMMENCÉ | ⚠️ bolt/lovable/base44 sont E2E ; **vercel/figma sont BLOCKED 424**. « Simulé » présenté comme réel est un défaut de **véracité**, pas seulement de fonctionnalité. ⚠️ Le garde-fou `check-no-runtime-mocks` bloque le mot « mock » — en tenir compte dans la rédaction du correctif. | PROD | D-15 |
| AUDX-132 | **Marketplace et Bounties réels** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-133 | **Mobile natif, push, biométrie, crash reporting** | P2 | NON_COMMENCÉ | — | PROD | D-15 |
| AUDX-134 | **SSO/SAML/SCIM, RBAC Enterprise, private deployments** | P2 | **PARTIEL** | Enforcement d'identité sur 14 routes livré (21/07) ; **SCIM reste**. `SAML_X509_CERTIFICATE` est câblé dans `deploy-prod.yml:145`. | PROD / SEC | D-15 |

---

## 10. Accès externes — AUDX-135 → AUDX-148

> ⛔ **Hors dépôt — NE PAS TENTER.** Ces lignes sont inscrites pour qu'aucun point ne soit
> perdu, et **assignées à Avi**. Aucune session ne doit les « faire » : elles exigent des
> accès (GCP, GitHub org, Stripe, Apple, Google Play) ou des actions destructrices /
> sortantes hors de la portée d'une PR. Elles restent **NON_COMMENCÉ** jusqu'à
> intervention d'Avi.
>
> ⚠️ Rappels de garde-fous applicables ici : **jamais de `printenv` en production**,
> jamais de lecture du trousseau, jamais de compte de test en production, jamais de
> suppression définitive de données. La preuve du SHA déployé se prend sur le **digest du
> deploy** + `gcloud container images list-tags`, jamais en listant l'environnement d'un pod.

| ID | Énoncé | Sév. | Statut | Note | Prop. |
|---|---|---|---|---|---|
| AUDX-135 | **Bindings WIF GCP** | P0 | NON_COMMENCÉ | Vague 1 de l'ordre retenu, mais **exécution = Avi**. | AVI |
| AUDX-136 | **Grant `attribute.repository/openaxcloud/vibecore`** | P0 | NON_COMMENCÉ | Conditionne AUDX-099 côté serveur. | AVI |
| AUDX-137 | **GitHub Environments et bypass administrateur** | P0 | **🔴 ACTION AVI** | **Geste exact** : Settings → Environments → `pr-ai-secrets` → cocher **« Required reviewers »** (≥ 1 mainteneur). ⚠️ **Prérequis direct de AUDX-097** : l'`environment:` posé par la PR #352 existe mais **ne protège rien** sans cette règle. | AVI |
| AUDX-138 | **Cloud Audit Logs** | P1 | NON_COMMENCÉ | Complément externe de AUDX-011. | AVI |
| AUDX-139 | **Rotation des clés** IA / Stripe / OAuth / JWT / chiffrement | P0 | **🔒 AVI — CLOS, ne plus remonter** | **Geste exact** : faire tourner `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY` dans les secrets GitHub, puis vérifier la révocation des anciennes côté fournisseurs. ⚠️ **À faire même si la PR #352 est mergée** : corriger la fuite n'efface pas l'exposition passée (les clés ont été lisibles pendant `pnpm install` de toute PR de la même origine). ⚠️ La clé de **chiffrement** reste, elle, non rotative tant qu'AUDX-010 (`keyId`) n'est pas fait. | AVI |
| AUDX-140 | **Build, signature et push des images** | P1 | NON_COMMENCÉ | — | AVI |
| AUDX-141 | **Déploiement Helm / Terraform** | P1 | NON_COMMENCÉ | ⚠️ `--reuse-values` fige `values-prod.yaml` (re-`--set` requis). | AVI |
| AUDX-142 | **Preuve gVisor et admission** | P1 | NON_COMMENCÉ | Clôture de AUDX-068/069. | AVI |
| AUDX-143 | **Stripe live** | P1 | NON_COMMENCÉ | Clôture de AUDX-019. | AVI |
| AUDX-144 | **GCS / CDN / DNS / TLS / domaines** | P1 | NON_COMMENCÉ | Clôture de AUDX-080. ⚠️ L'aperçu n'est **pas prouvable** en l'état (wildcard auto-signé). | AVI |
| AUDX-145 | **k6, soak, chaos, perte de zone, DR** | P1 | NON_COMMENCÉ | Vague 5 ; valide D-01 (1 000 workspaces). | AVI |
| AUDX-146 | **Restores CNPG et RPO/RTO** | P0 | NON_COMMENCÉ | Clôture de AUDX-025→028. | AVI |
| AUDX-147 | **Signature / notarisation Apple et Windows** | P1 | **🔒 AVI — CLOS, ne plus remonter** | **Geste exact** : révoquer puis réémettre le certificat Apple (`DESKTOP_CSC_LINK`) et le certificat Windows (`DESKTOP_WIN_CSC_LINK`), mettre à jour les secrets GitHub, **avant** la prochaine release desktop. ⚠️ `electron.yml` les exportait vers un job `pull_request` **sans aucune garde anti-fork** (AUDX-098). | AVI |
| AUDX-148 | **Publication iOS / Android** | P2 | NON_COMMENCÉ | — | AVI |

---

## 11. Gouvernance — AUDX-149 → AUDX-158

**Note de méthode.** Les compteurs de l'audit ont été **recomptés sur `origin/main`**.
Deux d'entre eux sont **exacts**, deux sont **différents de ma mesure**, et un groupe est
**non reproductible** parce que les registres qui portent ces statuts **n'existent pas sur
`main`** — ils vivent sur une branche de travail très en retard. C'est en soi un constat
de gouvernance : *le tableau de bord n'est pas sur la branche de référence.*

| ID | Énoncé (chiffre de l'audit) | Sév. | Statut | Vérification sur `origin/main` @ `9b59b3489` | Prop. |
|---|---|---|---|---|---|
| AUDX-149 | **25 P0 encore OPEN** | P1 | **NON VÉRIFIABLE** | Non reproductible : `docs/audit/GAP_REGISTER.yaml` **n'existe pas** sur `main` (`git ls-tree origin/main docs/audit/` ne le liste pas). `PLAN_REMAINING_UNIFIED.md` sur `main` ne contient que **8** occurrences de « P0 » et **1** seul « PROVEN ». Le chiffre 25 provient d'une source hors `main`. **Action : republier le registre sur `main` avant de piloter dessus.** | GOV |
| AUDX-150 | **11 PROVEN / 43 PARTIAL / 37 NOT_STARTED** | P1 | **NON VÉRIFIABLE** | Idem AUDX-149. Les registres présents sur `main` (`docs/parity/PRODUCTION_READINESS_REGISTRY.yaml`, `BOLT_DEBT_REGISTRY.yaml`) ne portent **qu'un seul statut** : `NON_FAIT` × **50** et × **29** respectivement — aucun PROVEN/PARTIAL/NOT_STARTED. | GOV |
| AUDX-151 | **159 surfaces UNKNOWN** | P1 | **ÉCART DE MESURE** | Mesuré sur `main` : `SURFACE_REGISTRY.yaml` déclare **174 `surfaceId`** et **224 occurrences** de `UNKNOWN`. Le chiffre 159 n'est reproductible ni comme nombre de surfaces ni comme nombre de champs UNKNOWN — **définition de la métrique à fixer** avant de la suivre. | GOV |
| AUDX-152 | **`PARITY_STATUS.md` référence encore `6709d2cc`** | P1 | **CONFIRMÉ** | `docs/parity/PARITY_STATUS.md:4` → `repoCommit: 6709d2cc` ; l.8 « run 33317678364 (2026-08-30…, commit 6709d2cc) ». Base réelle = `9b59b3489`. | GOV |
| AUDX-153 | **`SURFACE_REGISTRY.yaml` référence encore `06fabcf1`** | P1 | **CONFIRMÉ** | `docs/parity/SURFACE_REGISTRY.yaml:7` → `repoCommit: 06fabcf1`. | GOV |
| AUDX-154 | **Le bug DB #317 est décrit « PR non mergée » alors qu'il est fusionné** — vérifier et corriger | P1 | **CONFIRMÉ — correction à porter** | ✅ **Vérifié** : PR #317 est **MERGED**, `mergedAt 2026-09-01T09:07:28Z`, merge commit `43336cb1e70d3dd519412b2f4d14309200a4fbd6`, **présent sur `origin/main`**. ❌ `BUG_INVENTORY_LIVE.md:265` (BUG-DB-002) sur `main` porte toujours « **correctif en PR #317 (non mergé)** » et ses trois états ☐ ☐ ☐. **Correction requise** : 💻 Codé ✅ (fusionné), ✅ Testé live **reste ☐** — la preuve « créer une base depuis l'IHM et la voir apparaître » exige le **déploiement**, non acquis. ⚠️ Ne PAS cocher ✅ Testé live sur la seule fusion (règle `CLAUDE.md`). Voir AUDX-034. | GOV |
| AUDX-155 | **72 PR ouvertes** | P1 | **CONFIRMÉ (exact)** | `gh pr list -R openaxcloud/vibecore --state open --limit 200` → **72**. | GOV |
| AUDX-156 | **894 branches locales** | P2 | **ÉCART MINEUR** | `git branch \| wc -l` → **900** (l'écart s'explique par les branches créées depuis la passe d'audit, dont celle-ci). Ordre de grandeur **confirmé**. | GOV |
| AUDX-157 | **316 branches avec travail unique non poussé** | P2 | NON_COMMENCÉ | Non recompté ici (mesure coûteuse : un `rev-list` par branche sur 900 branches). À instruire avec AUDX-156. | GOV |
| AUDX-158 | **92 worktrees non commités** | P2 | **ÉCART DE MESURE** | `git worktree list \| wc -l` → **214** worktrees au total. Le chiffre 92 porte sur le sous-ensemble « non commités », non recompté ici. **Définition à fixer** (total vs sales) avant suivi. | GOV |

**Arbitrage gouvernance (D-14).** Fermer les **PR mortes et les doublons** ; **PAS de
rebasage en masse** des 72 PR. ⚠️ Piège connu sur ce dépôt : merger la **base** d'une pile
de PR **ferme la PR enfant** — réparation en quatre temps (recréer la base, rouvrir,
recibler, supprimer). Vérifier les piles avant toute fermeture.

---

## 12-bis. Points constatés HORS REMISE — AUDX-159 → AUDX-169

⚠️ **Ce que cette section prouve : le registre n'est PAS exhaustif du réel.**
Les 158 lignes ci-dessus couvrent exactement ce que l'audit externe a remis. Les
lignes ci-dessous ont été trouvées **en dehors** de cette remise, sur le produit
en marche. Elles sont numérotées dans la même série pour rester citables, et
regroupées ici pour que la provenance ne se perde pas.

**La leçon vaut plus que les deux lignes** : un audit, même sérieux, cadre ce
qu'il a regardé. Un P0 de production peut se tenir entièrement hors de ce cadre.
Toute nouvelle constatation vient ici, jamais dans les 158.

| ID | Énoncé | Sév. | Statut | Preuve / leçon | Prop. |
|---|---|---|---|---|---|
| AUDX-159 | **La génération IA était MORTE en production** — la route s'auto-annulait, et le chemin streaming rendait **200 avec zéro octet** | **P0** | **✅ Livré ET exercé — PR #358 mergée (`a354779a3c`)** | ⚠️ **Absent de TOUT audit** : ni la remise externe, ni les registres internes ne le portaient. Deux défauts distincts sur le même chemin : (a) le garde-fou anti-gaspillage tuait la génération qu'il devait protéger — une annulation déclenchée sans déconnexion réelle du client ; (b) le chemin **streaming** répondait **200 avec un corps vide**, donc un succès menteur, la pire forme d'échec (rien à voir dans les logs, rien à voir côté client, sauf que rien n'arrive). C'est la fonction centrale du produit. ✅ **Exercé en réel confirmé par Avi le 02/09** — c'est la première ligne du registre à atteindre cet état, et la seule à ce jour. Elle sert de repère : toutes les autres, y compris les correctifs en PR ouverte, restent au mieux 💻. | BE |
| AUDX-160 | **La pastille « aller au dernier message » était livrée depuis des semaines et rendue HORS ÉCRAN** — donc inutilisable | P1 | **NON_COMMENCÉ** | ⚠️ **Le point était coché « livré ».** Le code existait, il était correct, il était mergé — et personne n'avait jamais regardé le rendu. Résultat : une fonctionnalité inexistante en pratique pendant des semaines, avec un suivi qui affirmait le contraire. **C'est la justification concrète de la distinction 💻 Livré / ✅ Exercé** posée en tête de ce registre. Rejoint AUDX-103 (écrans coupés ou débordants) mais mérite sa propre ligne : ici le défaut n'est pas le CSS, c'est le **processus de clôture**. | FE |
| AUDX-161 | **MOTIF RÉCURRENT — un garde posé à l'ENTRÉE d'une opération asynchrone au lieu d'APRÈS son succès** | **P0** | **🔬 RECHERCHE FAITE — 1er correctif PR #370** | ⚠️ Trouvé trois fois en une journée sur des chemins sans rapport ⇒ **classe, pas bug**. **Recherche systématique menée le 02/09 : 9 candidats, 3 vrais défauts.** **Corrigé (PR #370)** : `VercelConnection.tsx:51` — `hasInitialized.current = true` posé **avant** l'`await` ⇒ une auto-connexion échouée verrouillait, l'effet ne repartait plus, **panneau déconnecté avec un jeton valide en main** et rien qui retente. Le verrou faisait **deux travaux avec un seul drapeau** : séparés en `autoConnectInFlight` (concurrence) et `hasInitialized` (succès seul) ; dépendances vides → `[user, token]`, sans quoi même verrou ouvert aucun re-essai n'était possible. **3 contre-épreuves.** **Faux positifs documentés pour ne pas les re-suspecter** : `SettingsTab.tsx:147` verrouille dans un `finally` (**dégradation voulue** vers le cache) ; `useProjectAiTranscriptHydration.ts:82` verrouille tôt **mais avec re-essai borné** — c'est la **forme de référence**. **Méthode qui l'attrape** : *casser l'opération et vérifier que le garde n'a PAS bougé*. **Reste** : 2 des 3 vrais défauts non encore corrigés. | SEC / BE |
| AUDX-162 | **Une primitive mal rangée est une primitive inexistante** — `useCoarsePointer()` est correcte mais vit dans un composant de barre latérale | P1 | NON_COMMENCÉ | La primitive **existe, est juste, et n'est utilisée nulle part** : rangée dans un composant de barre latérale, elle est introuvable pour quiconque cherche à détecter un pointeur grossier. Résultat concret : les chantiers tactiles (**AUDX-103** écrans coupés, **AUDX-105** cibles < 44 px, **AUDX-107** swipe) ont été traités **sans** elle, chacun réinventant sa propre détection ou s'en passant. ⚠️ **Le défaut n'est pas le code, c'est le rangement** — même famille qu'AUDX-160 (livré ≠ utilisable). **Action** : extraire vers un module de hooks partagé, puis **grep des détections concurrentes** pour les remplacer ; sans cette seconde moitié, l'extraction ne fait qu'ajouter une copie de plus. | FE |
| AUDX-163 | **DÉFAUT STRUCTUREL — une bonne pratique écrite dans le dépôt et non adoptée ailleurs** | **P1** | NON_COMMENCÉ | ⚠️ **Troisième constatation, donc plus une coïncidence.** Trois fois, la forme correcte **existait déjà** et le code neuf ne l'a pas reprise : (1) `useProjectAiTranscriptHydration.ts` porte la forme de référence du garde asynchrone, et `VercelConnection.tsx` a réintroduit le défaut à côté (**AUDX-161**) ; (2) `useCoarsePointer()` est correcte et **inutilisée**, rangée dans un composant de barre latérale (**AUDX-162**) ; (3) le ticket WS collaboration portait déjà la bonne construction *et* le piège de liste d'IP documenté — il a fallu le relire pour ne pas le repayer sur le ticket runtime (**AUDX-004**). **Le défaut n'est ni le code ni la personne : c'est la DÉCOUVRABILITÉ.** Une primitive correcte mais mal rangée est **une primitive inexistante**, et elle coûte deux fois — le défaut réintroduit, puis la copie concurrente qui divergera. **Action** : inventaire des primitives transverses (gardes asynchrones, détection de pointeur, tickets signés, confinement de chemin), extraction vers des modules nommés, **puis grep des ré-implémentations** pour les remplacer ; sans cette seconde moitié, l'extraction ne fait qu'ajouter une copie de plus. **Un correctif qui ne range pas sa primitive prépare le suivant.** ⚠️ **Vérification demandée le 02/09 — résultat contre-intuitif, à ne pas perdre** : `app/lib/hooks/useReleasableLatch.ts` **n'existe nulle part** (ni `main`, ni ~400 branches distantes, ni sur disque). **Il n'y a donc pas la duplication supposée** — mais il y en a une autre, réelle et en vol : **#371** livre un mécanisme de loquet **nommé et testé** (`creerGardeDeRestauration`) rangé dans `app/components/chat/`, tandis que **#370** ré-implémente **le même motif en ligne** dans `VercelConnection.tsx`. Aucune des deux ne connaît l'autre. **Recommandation : garder celle de #371** — elle est nommée, testée, et gère le jeton de libération — mais **la déplacer hors de `app/components/chat/`** vers un module de hooks partagé, puis y rebrancher #370. Rangée là où elle est, elle sera invisible à la prochaine session, et le motif sera ré-implémenté une troisième fois. | FE / BE |
| AUDX-164 | **BUG-IDE-010 — l'état de l'IDE n'était jamais restauré, silencieusement** (6 chargements sur 8) | **P0** | **💻 Livré — PR #371 (ouverte)** | ⚠️ **Quatrième instance d'AUDX-161, et la plus coûteuse** : le garde était posé à l'ENTRÉE de l'opération, donc il **déduisait le succès de l'absence de signal d'échec**. L'effet dépendant de `projectFiles`, leur arrivée le rejouait ; le nettoyage posait `cancelled = true` **sans libérer le garde**, la relance sortait sur « déjà restauré » et la réponse en vol sortait sur `cancelled` **sans rien appliquer**. **Mesuré : 6/8 avant, 0/8 après.** ⚠️ **Il produisait aussi de FAUSSES ACCUSATIONS** sur d'autres panneaux — voir AUDX-165. | FE |
| AUDX-165 | **LEÇON DE DIAGNOSTIC — un symptôme observé dans un composant ne prouve pas que le défaut y réside** | **P1** | NON_COMMENCÉ | Les panneaux **`env`** et **`integrations`** avaient été classés **cassés à tort** : leurs erreurs venaient d'une **cause unique en amont** (AUDX-164). Deux composants sains ont donc été inscrits comme défectueux, et auraient été « corrigés » — c'est-à-dire modifiés sans raison, avec le risque d'y introduire un vrai défaut en cherchant à réparer un symptôme importé. ⚠️ **Conséquence sur ce registre** : un point qui décrit un COMPOSANT plutôt qu'un MÉCANISME est suspect tant que la cause n'est pas remontée. **Règle** : avant d'inscrire un composant comme défectueux, vérifier qu'il est bien la SOURCE — un symptôme partagé par plusieurs surfaces désigne presque toujours un défaut en amont, pas plusieurs défauts en aval. Rejoint AUDX-103 et AUDX-113, à re-vérifier sous cet angle. | FE / GOV |
| AUDX-166 | **Une résolution de conflit automatique a produit du code cassé, sans aucun signal de git** | **P1** | NON_COMMENCÉ | Git n'a **rien signalé** : pas de marqueur, pas de conflit, un arbre propre. Seule **la relance des tests** l'a révélé. ⚠️ Rejoint le danger déjà consigné de `rerere`, qui peut résoudre un conflit seul **en jetant le travail d'autrui sans marqueur**. **Règle à appliquer sans exception** : *après toute résolution de conflit — automatique, `rerere`, rebase ou merge — relancer les tests concernés avant de pousser.* Un arbre propre n'est pas une preuve ; c'est l'absence d'une preuve. | GOV |
| AUDX-167 | **Une LENTEUR devenue PANNE — `GET /api/projects/<id>/ide-state` à 572–3 914 ms** | **P0** | **💻 Livré (partiel) — PR #374** | **Mesuré en production** : 572 à **3 914 ms**, **tout côté serveur avant le premier octet**, contre **220 ms** pour `/api/health` sur la même infrastructure. Franchit le **seuil d'abandon de 5 s** du client ⇒ **panneau de conversation vide pour toute la durée de la page**. ⚠️ **La lenteur ne dégrade pas la fonction, elle la SUPPRIME** — d'où une ligne de registre et non un ticket de performance. **Deux faits établis dans le code** (distincts de la mesure) : (a) la route **émettait un ETag et ignorait `If-None-Match`**, donc chaque chargement resérialisait tout ; (b) le blob est **NON BORNÉ** — le `PUT` accepte jusqu'à `API_BODY_LIMIT_BYTES`, **25 Mo**. **Fait (#374)** : GET conditionnel, une revisite coûte un **304 sans corps**. ⚠️ **Ne rend PAS le premier chargement plus rapide** ; supprime le coût **répété**. ⚠️ **Production non profilée** : attribuer les 3 914 ms à une cause unique serait une déduction — le blob non borné reste **une piste à mesurer**. ⚠️ Bornage du blob au `PUT` **volontairement pas fait** : casserait la sauvegarde des états déjà volumineux (règle 19). **Lien** : même symptôme qu'**AUDX-164** (panneau vide) pour une **cause indépendante** — illustration directe d'**AUDX-165**. 🔴 **CAUSE TOUJOURS NON ÉTABLIE — et deux hypothèses déjà écartées.** (1) Ce n'est pas le stockage : base de données **3 ms**, Redis **1,4 ms**. (2) Ce n'est pas non plus l'étranglement CPU : le 92 % était un **cumul sur la vie du pod**, pas un état courant (voir **AUDX-168**, diagnostic corrigé). **Le point reste ouvert avec sa mesure et sans conclusion**, ce qui vaut mieux qu'une cause inventée. ⚠️ **Ce que cela valide, et qu'il faut retenir** : j'avais refusé d'attribuer les 3 914 ms à une cause unique faute d'avoir profilé la production. Ce refus a **évité une fausse conclusion** — et, plus concrètement, a évité de « corriger » une route saine et de compter le point comme fermé pendant que la vraie cause continuait d'agir. **C'est exactement AUDX-165 appliqué à une mesure de performance.** Le GET conditionnel de #374 **reste utile** (un cache à moitié câblé ne servait à rien) mais **ne traite pas la cause** ; le point ne se ferme pas dessus. | BE / FE |
| AUDX-168 | **Autoscaler API sans marge de montée** — 6 replicas sur 6, cible CPU 68 %/70 % | **P1** | **⚠️ DIAGNOSTIC CORRIGÉ — PR #375 est une marge, pas un correctif** | 🔴 **Correction du 02/09, et c'est la deuxième fois qu'une conclusion de performance se révèle fausse sur ce chemin.** Le « 92 % du temps étranglé » était un **CUMUL sur toute la vie du pod** — réel et prolongé (**3 h 45**), mais **historique**. Sous charge provoquée aujourd'hui : **2,2 %** sur intervalle, pods à **moins d'un dixième** de leur plafond. **#375 est donc une marge préventive, pas un correctif de lenteur** — et le présenter autrement aurait fermé un point qui n'était pas le bon. **Le vrai signal est ailleurs** : l'autoscaler est à **6 replicas sur 6**, cible CPU **68 % contre 70 %** — il est **collé à son plafond sans marge de montée**. Un pic ne peut plus être absorbé par de l'horizontal. ⚠️ **Leçon cumulée avec AUDX-167** : une métrique **cumulative** lue comme un **état courant** produit exactement la même erreur qu'un symptôme lu comme une cause (**AUDX-165**). Avant de conclure sur une latence : vérifier si la métrique est un **taux sur intervalle** ou un **compteur depuis le démarrage**. ⛔ Réglage Helm/GKE — hors PR. | AVI / RT |
| AUDX-170 | **L'image de production embarque des chaînes de compilation natives jamais exécutées** — et `pnpm prune --prod` ne les enlève pas | **P1** | **✅ CORRIGÉ — PR #415 (ouverte)** | Remonté par Avi le 03/09, **re-mesuré ici**. `pnpm why esbuild --prod` : **51 paquets esbuild atteignables depuis les dépendances de production**, par `@react-router/fs-routes > @react-router/dev > vite > esbuild`, `… > wrangler > esbuild` et `vite-plugin-node-polyfills > vite > esbuild`. Deux versions (0.21.5, 0.27.3), chacune livrant son binaire natif deux fois : **4 binaires, 38,6 Mo** mesurés sur cet hôte (ordre de grandeur cohérent avec les ~30 Mo relevés par Avi ; je porte le chiffre que j'ai mesuré). **Cause racine** : deux plugins BUILD-TIME déclarés en `dependencies`. `prune --prod` ne peut rien : il retire les devDependencies, or ceux-ci sont atteignables depuis `dependencies`. **Vérifié avant de conclure** : `pnpm run build` complet réussit, et le bundle serveur produit ne référence **aucun** des cinq paquets (0/0/0/0/0) — le prune ne peut donc pas casser le runtime. ⚠️ **Deux versions du garde-fou étaient CREUSES** : la première lisait `node_modules` (donc le verdict d'un autre checkout, elle déclarait l'arbre corrigé cassé) ; la seconde lisait le lockfile mais passait la version nue comme clé de snapshot, s'arrêtait après les dépendances directes et **passait sur main**. La version retenue lit `pnpm-lock.yaml` et suit aussi les `optionalDependencies` (`autoInstallPeers: true`). Contre-épreuve : lockfile de main → exit 1, 5 chemins ; arbre corrigé → exit 0, 1 211 paquets parcourus. | REL / SEC | — |
| AUDX-169 | **Écriture des domaines sur la MAUVAISE organisation** — `firstOrganizationOrNull` au lieu de celle du projet | P1 | **✅ CORRIGÉ — PR #385 (ouverte)** | L'ajout **et** la vérification d'un domaine visent l'organisation renvoyée par `firstOrganizationOrNull(user)` et **non celle du projet** concerné. ⚠️ **Aucune fuite aujourd'hui** : il y a **0 utilisateur multi-organisations**, donc la « première » est toujours la bonne. **C'est un piège certain au premier client multi-organisations** — et ce client-là sera par construction un compte Enterprise, c'est-à-dire le pire moment pour découvrir qu'un domaine a été écrit et vérifié sur la mauvaise organisation. ⚠️ **Classe de défaut à retenir** : un bug **latent derrière une donnée qui vaut 0 ou 1**. Aucun test ne le révèle tant que le jeu de données ne contient pas de second cas ; il n'apparaît pas non plus en production, parce que la production n'a pas encore la forme qui le déclenche. **Le test qui l'attrape doit CRÉER la seconde organisation**, pas observer les données existantes. **Corrigé (#385)** : l'organisation du projet **était déjà disponible** — `/projects/:id` la renvoie ; c'est le **type local** `Project` qui ne la demandait pas, ce qui explique qu'aucune relecture n'ait tiqué. Loader et action la résolvent depuis le projet ; celle de l'utilisateur ne sert plus qu'à savoir s'il en a une. **Le test CRÉE la seconde organisation** et asserte sur les ids réellement touchés par les appels. **2 contre-épreuves** + un contrepoids règle 19 sur le cas mono-organisation. | SEC / BE |

---

## 12. Points d'attention transverses

Recueillis pendant la vérification, ils s'appliquent à plusieurs lignes et évitent des
faux positifs comme des faux « corrigés ».

1. **Le mécanisme n'est presque jamais le problème — le site d'appel l'est.**
   AUDX-001, AUDX-044, AUDX-072 et AUDX-074 partagent cette forme : un helper correct,
   des appelants incomplets. Chaque mécanisme doit être **cassé séparément** dans les
   tests, sinon un test vert n'atteste rien.
2. **Une NetworkPolicy est une UNION, pas une intersection.** Un `podSelector: {}`
   permissif (`allow-platform-required-egress`) **annule** toute politique plus stricte
   ajoutée à côté. Le dépôt le documente déjà pour le screenshotter. Toute ligne
   « resserrer les egress » (AUDX-067, AUDX-006) doit **exclure** le pod des politiques
   génériques, sinon elle est cosmétique.
3. **La remédiation évidente peut être une régression** — cf. AUDX-083 : recréer les deux
   fichiers manquants ré-ouvrirait le port 80 depuis les sandboxes. **Toujours lire
   l'historique de suppression avant de restaurer un fichier.**
4. **Deux signaux CI sont morts** : le shard `Playwright mobile-390` (i18n) est rouge par
   timeout depuis ≥24/08 sur **toutes** les branches, et `platform:verify` n'est câblé
   nulle part. Ne pas conclure d'un vert qu'on n'a pas.
5. **Un test vert peut épingler sa propre copie.** Cas déjà rencontré ici : deux specs
   vertes vérifiaient leur propre duplicata. **Contre-épreuve obligatoire dans les deux
   sens** (casser le correctif → rouge ; élargir → rouge).
6. **Les branches locales mentent sur `main`.** Écart mesuré jusqu'à ~990 commits ;
   `BaseChat.tsx` y perd 3 078 lignes. **Toute preuve se prend sur `origin/main`.**

---

## Annexe A — table de correspondance énoncé → identifiant

Contrôle d'exhaustivité : **158 lignes** couvrant la remise, aucune perte — plus **11 lignes hors remise** (§12-bis), qui prouvent que le registre n'est pas exhaustif du réel.

| Section de la remise | Plage | Nb |
|---|---|---|
| Sécurité applicative | AUDX-001 → 013 | 13 |
| Backend, données, facturation | AUDX-014 → 035 | 22 |
| Collaboration et perte de fichiers | AUDX-036 → 044 | 9 |
| Snapshots et checkpoints | AUDX-045 → 055 | 11 |
| Scheduler | AUDX-056 → 066 | 11 |
| Runtime, gVisor, Nix, déploiements | AUDX-067 → 082 | 16 |
| CI/CD et chaîne d'approvisionnement | AUDX-083 → 102 | 20 |
| Frontend, mobile/tablette, UX | AUDX-103 → 119 | 17 |
| Parité produit | AUDX-120 → 134 | 15 |
| Accès externes (hors dépôt) | AUDX-135 → 148 | 14 |
| Gouvernance | AUDX-149 → 158 | 10 |
| Points constatés **hors remise** | AUDX-159 → 169 | 11 |
| **Total** | | **169** |

Les lignes **AUDX-034**, **AUDX-035** et **AUDX-082** ont été **ajoutées** au découpage
littéral de la remise : la première et la deuxième parce que la remise demandait
explicitement de *vérifier et corriger* l'état du bug DB #317 (deux défauts distincts en
sont ressortis), la troisième parce que la décision D-08 porte une **action** (vérifier
puis supprimer le second cluster) qui doit être suivie comme telle et non seulement
comme un arbitrage.

## Annexe B — synthèse des statuts

| Statut | Nb | Lecture |
|---|---|---|
| `NON_COMMENCÉ` | 121 | Défaut. Aucune preuve de traitement. |
| `PARTIEL` | 13 | Un mécanisme existe **et est cité** ; l'énoncé n'est pas couvert. |
| `DÉJÀ_FAIT` | 2 | AUDX-034 (correctif #317 fusionné), AUDX-074 (mécanisme générations Nix). |
| `✅ CORRIGÉ` (PR ouverte, non mergée) | 11 | **AUDX-003** — PR #354 ; **AUDX-001** — PR #355 ; **AUDX-008** — PR #363 ; **AUDX-018** — PR #368 ; **AUDX-006** — PR #362 (complétée) ; **AUDX-004** — PR #357 (complétée) ; **AUDX-010** — PR #398 ; **AUDX-011** — PR #399 ; **AUDX-024** — PR #400 ; **AUDX-022** — PR #402 ; **AUDX-021** — PR #403. |
| `🟠 PARTIEL` (PR ouverte, reste identifié) | 3 | **AUDX-005** — PR #361 : code prêt, bascule d'exploitation non faite (D-02 encore non tenue). **AUDX-017** — PR #365 : provenance tracée, sous-déclaration visible mais pas impossible. **AUDX-012** — PR #401 : 5 services sur 8 scopés ; `api`/`web`/`admin` restent complets (secrets OAuth par nom calculé) et **les rôles DB ne sont pas séparés**. |
| `TRAITÉ DANS CETTE PR` | 4 | AUDX-083, 098, 099 (complets, contre-épreuves faites) ; **AUDX-097 partiel** — le contrôle final (règle « relecteurs requis » sur l'environment `pr-ai-secrets`) relève d'**AUDX-137 / Avi**. |
| `REPORTÉ (décision)` | 2 | AUDX-117, AUDX-118 — **D-13**. |
| `NON VÉRIFIABLE` / `ÉCART DE MESURE` | 5 | AUDX-149, 150, 151, 156, 158 — métrique ou source à rétablir. |
| `CONFIRMÉ` | 4 | AUDX-152, 153, 154, 155 — constats d'audit reproduits à l'identique. |

⚠️ **Aucune ligne de ce registre ne vaut clôture.** Conformément à `CLAUDE.md`, un point
n'est « fait » que lorsque **✅ Testé live** est coché — vérification à l'écran + greps,
responsive web / tablette / mobile. `📤 Dispatché` et `💻 Codé` ne suffisent jamais.
