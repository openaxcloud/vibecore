# Point panneaux IDE — état de la connaissance

> **Régénéré à chaque passage du balayage QA continu.**
> Dernière régénération : **2026-09-01 ~17h40**, balayage QA continu (2ᵉ passage).

---

## ⚠️ 1. Écart de version — lisez ceci avant toute conclusion

**La production ne tourne PAS le code de `main`, et l'environnement d'audit tourne un code
encore plus ancien que la production.** Tout constat ci-dessous doit être lu à travers cet écart.

### Relevé de 17h40 — la production a rattrapé son retard

| Surface | SHA déployé | Date du commit | Retard vs `main` |
|---|---|---|---:|
| `main` (référence) | `fce8639ab` | 01/09 | — |
| **prod `api`** | `7fe97070b7` | 01/09 13:15 | **2 commits** |
| **prod `web`** | `273d161ab3` | 01/09 16:23 | **1 commit** |
| **env d'audit `web` + `api`** | `040dd2976d` | 27/08 07:59 | **128 commits** |

**L'atterrissage a eu lieu.** La production est désormais à jour à 1–2 commits près, et les
28 commits listés au §5 sont en ligne. La liste de re-vérification du §5 est donc **active**,
plus « en attente ».

**Mais le déséquilibre s'est inversé et aggravé** : l'environnement d'audit, lui, n'a pas bougé.
Il est maintenant **128 commits derrière la production**. Tout constat panneau du §3 a été
obtenu sur ce build périmé et doit être rejoué. C'est aujourd'hui le principal frein de ce
balayage.

### Relevé précédent (matin), conservé pour mémoire

| Surface | SHA déployé | Date du commit | Retard vs `main` |
|---|---|---|---:|
| `main` (référence) | `7fe97070b` | 01/09 13:15 | — |
| **prod `api`** | `17fe73df55` | 01/09 03:38 | **26 commits** |
| **prod `web`** | `e597a021ab` | 31/08 22:46 | **28 commits** |

Trois conséquences, toutes gênantes :

1. **La prod reste hétérogène**, mais dans l'autre sens et de peu : `web` (`273d161ab3`, 16h23)
   est désormais **plus récent** que son `api` (`7fe97070b7`, 13h15).
2. **L'environnement d'audit est 100 commits DERRIÈRE la production** (`040dd2976d` est un
   ancêtre de `e597a021ab`). Il est donc **plus vieux que la prod**, pas plus récent : un défaut
   qu'on y observe peut avoir été corrigé depuis, et un correctif qu'on y valide ne prouve rien
   sur la prod.
3. **Tout ce qui est observé en ce moment reflète de l'ancien code.** L'atterrissage des
   26/28 commits est en cours ; la liste de re-vérification est au §5.

*Méthode de relevé des SHA (aucune commande d'environnement dans un pod de prod) : lecture du
digest d'image sur le Deployment, puis résolution du digest en tag via
`gcloud container images list-tags`.*

---

## 2. Règle d'état — stricte

| État | Signification |
|---|---|
| ✅ | **Preuve datée obtenue EN PRODUCTION.** Rien d'autre ne donne ✅. |
| 🔧 | Vérifié **hors production** (env d'audit `040dd2976d`) — fonctionne là-bas, **non prouvé en prod**. |
| ❌ | Défaut constaté et mesuré. |
| ⬜ | **Inconnu — jamais vérifié** par ce balayage. |

> **Aucun panneau ne porte ✅ dans ce document.**
> Motif, à dire clairement plutôt qu'à masquer : la vérification d'un panneau IDE exige un
> compte, un projet et un espace de travail. Or **la création d'un compte de test sur la
> production est interdite** à cette session. Il n'existe donc, à ce jour, **aucune preuve
> panneau obtenue en production** — ni par ce balayage, ni portée par un autre document que
> j'aie pu recouper. Lever ce plafond demande une décision d'Avi (compte de QA dédié en prod,
> ou preuve produite par la session « Livraisons + preuves prod »).

---

## 3. Les 10 panneaux « trous béants » — balayés le 01/09

Priorité traitée en premier. **Méthode** : un **projet neuf par panneau** (pour éliminer la
persistance d'onglets côté serveur, qui fausse tout essai en contexte réutilisé), IDE mobile
**390×844**, thème clair, locale FR, ouverture via la feuille d'outils par le hook
`data-testid="tool-item-<id>"`, puis assertion sur une **ancre de contenu propre au panneau**
— jamais sur le simple fait qu'un panneau se soit affiché.

| Panneau | id | Ouvre ? | Contenu rendu | Cible tactile | Erreurs console | État |
|---|---|---|---|---:|---:|:---:|
| Vue d'ensemble | `overview` | oui | « APERÇU DU PROJET », fichiers, branche, espace de travail | 166×77 | 0 | 🔧 |
| Verrous | `locks` | oui | panneau Verrous rendu (client, sans panneau de service — conforme) | 166×77 | 0 | 🔧 |
| Partager | `share` | **action, pas panneau** | **lien projet copié** dans le presse-papiers | 166×70 | 0 | 🔧 |
| Secrets | `secrets` | oui | « Aucun secret de projet », « + Nouveau secret », « Importer .env » | 166×70 | 0 | 🔧 |
| Collaborateurs | `collaborators` | oui | Présence (1 utilisateur en ligne), rôles | 166×70 | 0 | 🔧 |
| Journaux | `logs` | oui | Console / flux de travail / système, compteurs, filtre regex | 166×70 | 0 | 🔧 |
| Paquets | `packages` | oui | « INTELLIGENCE DES PAQUETS », 7 dépendances détectées | 166×70 | 0 | 🔧 |
| Intégrations | `integrations` | oui | catalogue d'intégrations (auth, etc.) | 166×70 | 0 | 🔧 |
| Variables d'environnement | `env` | oui | 3 portées + recherche + création | 166×77 | 0 | 🔧❌ |
| Extensions | `extensions` | oui | marketplace MCP, compteur « INSTALLÉ » | 166×70 | 0 | 🔧❌ |

**Bilan : les 10 s'ouvrent et rendent du contenu réel. Zéro erreur console, zéro requête ≥ 400,
zéro débordement horizontal, toutes les cibles tactiles ≥ 44 px.** C'était le principal risque
et il ne s'est pas matérialisé.

### Ce que le balayage a quand même trouvé

**❌ Termes de déploiement mal traduits en français — visibles dans les panneaux.**
Ce ne sont pas des chaînes manquantes mais des entrées de catalogue **traduites à tort** :
`app/lib/i18n/catalogs/chat.ts` (la clé encode le terme source anglais).

| Clé | Valeur EN (ligne) | Valeur FR (ligne) | Attendu en FR |
|---|---|---|---|
| `chat.copy.production_df70fc79` | `Production` (677) | **`Fabrication`** (2262) | Production |
| `chat.copy.extensions_656bcfe2` | `Extensions` (345) | **`Rallonges`** (1915) | Extensions |
| `chat.copy.extension_f9896101` | `extension` (343) | **`rallonge`** (1913) | extension |
| `chat.copy.staging_c9fb656c` | `Staging` (895) | **`Mise en scène`** (2488) | Staging |

Mesuré au rendu : sur le panneau **Variables d'environnement** en 390 px, « Fabrication »
apparaît **5 fois** sur un seul écran — l'onglet, « Rechercher des variables Fabrication »,
« Aucune variable Fabrication », « …l'environnement d'exécution Fabrication de ce projet »,
et le sélecteur « Portée ». L'utilisateur qui configure une variable de **production** lit
« Fabrication » (sens : usine). Sur le panneau **Extensions**, le titre dit « Extensions » et
le sous-titre juste en dessous dit « **Rallonges** » — deux traductions du même mot à l'écran.
Capture : `evidence-2026-09-01/m3-env.png`.

*Contrôle négatif effectué* : trois autres écarts détectés par la même sonde
(`cache` → « Mémoire cache », `runtime` → « Environnement d'exécution »,
`secrets` → « Variables secrètes ») sont du **français correct** et ne sont **pas** retenus.

**Non retenu, mesuré et écarté** — la rangée d'onglets d'environnement en 390 px affiche
« Fabric… » tronqué. La mesure montre que la rangée est bien **défilable**
(`scrollWidth 290 > clientWidth 243`, `overflow-x: auto`) : il y a une gêne visuelle, pas une
perte de fonction. **Ce n'est pas compté comme défaut.**

**Non retenu — faux positif de ma propre sonde.** Premier passage : les 10 panneaux semblaient
bloqués sur « Chargement de l'IDE E-Code ». Cause réelle : mon attente de 7 s était plus courte
que le démarrage de l'IDE (~10 s mesurées). Rejoué avec une condition d'attente explicite,
les 10 rendent. **Aucun défaut ici.**

---

## 4. Les 22 autres panneaux

| Panneau | id | Couvert par `ide-panel-smoke` (CI) | Preuve prod | État |
|---|---|:---:|:---:|:---:|
| Éditeur | `editor` | oui | aucune | ⬜ |
| Aperçu / Webview | `preview` | oui | aucune | ⬜ |
| Bibliothèque de fichiers | `files` | oui | aucune | ⬜ |
| Rechercher | `search` | oui | aucune | ⬜ |
| Base de données | `database` | oui | aucune | ⬜ |
| Stockage objet | `object-storage` | oui | aucune | ⬜ |
| Supervision | `monitoring` | oui | aucune | ⬜ |
| Flux de travail | `workflows` | oui | aucune | ⬜ |
| Débogueur | `debugger` | oui | aucune | ⬜ |
| Déploiements | `deployments` | oui | aucune | ⬜ |
| Sécurité | `security` | oui | aucune | ⬜ |
| Git | `git` | oui | aucune | ⬜ |
| Activité | `activity` | oui | aucune | ⬜ |
| Terminal / Shell | `terminal` | oui | aucune | ⬜ |
| Instantanés | `snapshots` | oui | aucune | ⬜ |
| Paramètres | `settings` | oui | aucune | ⬜ |
| **Agent** | `agent` | **NON** | aucune | ⬜ |
| **Compétences** | `skills` | **NON** | aucune | ⬜ |
| **Studio** | `studio` | **NON** | aucune | ⬜ |
| **Ports** | `ports` | **NON** | aucune | ⬜ |
| **Palette de commandes** | `commands` | **NON** | aucune | ⬜ |
| **Partager** | `share` | **NON** | aucune | 🔧 (§3) |

**❌ Trou de couverture CI mesuré : 6 des 32 onglets IDE n'ont aucune couverture dans
`tests/e2e/ide-panel-smoke.spec.ts`** — `agent`, `skills`, `studio`, `ports`, `commands`,
`share`. Le plus gênant est **`agent`** : c'est la surface centrale du produit, et c'est aussi
celle qui concentre le plus de correctifs non encore en ligne (§5). Vérifié par recoupement des
32 ids de `app/lib/mobile-ide-tabs.ts` avec la liste `ideServicePanels` du spec.

*Note d'honnêteté* : « couvert par la CI » ne vaut pas preuve produit. Le spec tourne contre une
pile locale, pas contre la production ; et une couverture CI verte n'a pas empêché les défauts
d'amputation mobile trouvés le matin même (voir `BUG-QA-GUARD-BLIND-001`).

---

## 5. À re-vérifier dès l'atterrissage des 28 commits

Liste dérivée des commits présents sur `main` et **absents de la prod `web`** (`e597a021ab..main`).
Rien ici n'est vérifiable tant que le déploiement n'a pas atterri.

| Surface à re-vérifier | Commits concernés | Pourquoi |
|---|---|---|
| **Panneau Agent** | `7fe97070b`, `c6197a225`, `ff290b502`, `9f36084fd`, `9a3fcd18f` | 54 % des messages d'assistant vides en base ; fil d'un projet rouvert reçu puis jeté ; narration ajoutée ; zone de saisie sur deux lignes. **Cinq correctifs sur le panneau le moins couvert.** |
| **Panneau Base de données** | `43336cb1e` | Le panneau ne pouvait afficher **aucune** base alors que cinq existent en production. |
| **Panneau Terminal / Shell** | `e9d73b9b2` | Le créneau de quota appartient à la session, plus au socket. |
| **Panneau Problèmes / quota** | `f981a198b` | Le rejet de quota mène désormais au panneau Problèmes. |
| **Thème, tous panneaux** | `c17a8e2cb` | 47 textes affichés sur une teinte de leur propre couleur. |
| **Pages d'authentification** | `7a38c609a` | Panneau d'accroche en blanc sur orange, mesuré à **2,05:1**. |
| **IDE (typage / branches racines)** | `b2dd9dabf` | 5 erreurs de typage à risque d'exécution, dont un décalage des branches racines. |
| **Infobulles IDE** | `417b6c94e` | Deux infobulles affichaient leur clé technique à l'utilisateur. |
| **/admin — fournisseurs d'IA** | `e62f8655f` | Les 4 fournisseurs passent en lecture seule. |
| **Limitation de débit** | `0038dc2c7` | Préservation de l'IP source du client. |

**En attente également** : les 3 amputations mobiles corrigées ce matin
(`BUG-QA-MOBILE-CLIP-001/002/003`, PR #336) ne sont **ni sur `main` ni en prod** — elles
attendent la revue, puis un déploiement.

---

## 6. Ce que ce document ne prouve pas

- **Aucune preuve en production.** Voir §2 : création de compte de test interdite en prod.
- **Aucun des 10 panneaux n'a été balayé en thème sombre**, ni en 768 / 1024 / 1440 px avec la
  méthode « projet neuf ». Seuls 390 px clair (méthode complète) et 1440 px clair (méthode
  simplifiée, onglets persistés) ont été couverts. **Prochaine passe.**
- **Les 22 panneaux du §4 n'ont pas été ouverts par ce balayage.** Leur ⬜ signifie « pas de
  preuve de MA part », pas « personne ne les a jamais regardés ».
- L'environnement d'audit étant **antérieur à la production**, un ❌ constaté ici peut déjà être
  corrigé en ligne, et un 🔧 ne dit rien de la prod.

---

## 7. Deuxième passage — 2026-09-01, ~17h40

### 7.1 Ce qui a changé depuis le premier passage

La production a atterri (§1). **Les 10 panneaux du §3 restent donc à rejouer** : ils ont été
mesurés sur l'environnement d'audit, désormais **128 commits derrière la production**. Leur
état reste 🔧 et ne peut pas monter à ✅.

**Le plafond du §2 n'a pas bougé** : la création d'un compte de test en production reste
interdite à cette session, et un panneau IDE exige un compte, un projet et un espace de travail.
**Aucun panneau ne peut donc passer ✅ sans une décision d'Avi** (compte de QA dédié en prod, ou
preuve produite par la session « Livraisons + preuves prod »).

**Surface intermédiaire montée pendant ce passage** : un serveur de développement local sur
`main` (worktree `wt-qasep01`, port 5173). Ce n'est pas la production, mais c'est **du code
courant**, contre les 128 commits de retard de l'env d'audit. Il a servi aux mesures du §7.3.

> ⚠️ **Piège de worktree rencontré, à connaître.** Le `node_modules` du worktree était un
> symlink vers celui du checkout principal ; or les liens `@vibecore/*` y sont **relatifs** et
> pointaient vers les paquets du checkout principal, qui est sur une **autre branche**. Résultat :
> `Cannot find module '@vibecore/editor/install-pwa-sw'` et **500 sur toutes les pages**.
> Réparé en remplaçant le symlink par un vrai répertoire de liens, avec `@vibecore/*` pointant
> vers les paquets **du worktree**. `pnpm install` n'a **pas** été lancé : dans un worktree, il
> purge le `node_modules` partagé du checkout principal.

### 7.2 `/mobile` — deux grilles de plus, trouvées par le garde-fou

Le spec ajouté le matin (`tests/e2e/mobile-content-clipping.spec.ts`) a **échoué en CI sur
`main`** : `/mobile` amputait encore **14 px** (`body.scrollWidth = 404` pour un viewport de
390), de façon déterministe — essai initial **et** deux reprises. Deux grilles de
`EcodeMobilePage` n'avaient pas de piste de base clampée (accroche et cartes) ; corrigées
(commit `15821f583`).

> ⚠️ **Non reproductible en local sur macOS.** Mesuré sur le serveur local à la même révision :
> `clip = +0 px`, **avec et sans** le correctif. Le débordement dépend donc des **polices de la
> plateforme** : il apparaît sur les runners Linux de la CI, pas sur macOS. **La CI est ici le
> seul juge honnête**, et c'est elle qui valide le correctif. À retenir pour toute mesure future
> de min-content : une mesure macOS propre ne prouve rien pour Linux.

### 7.3 Groupe contraste — repris de la campagne arrêtée

**Constat : le chantier est déjà fait et il tient.** Le correctif `c17a8e2cb` (« 47 textes sur
une teinte de leur propre couleur ») est sur `main` et en production.

**L'énumération est bien faite depuis la feuille COMPILÉE**, pas depuis une liste tenue à la
main : `app/styles/tint-contrast-sweep.spec.ts` compile `index.scss` avec `sass-embedded` et
dérive les paires texte/fond de la sortie. Le fichier documente aussi le piège que la feuille
compilée écrit `:root[data-theme=light]` **sans guillemets**, et **échoue bruyamment s'il n'a
rien mesuré** — le faux négatif le plus coûteux est rendu impossible plutôt que signalé.

| Vérification | Résultat |
|---|---|
| `tint-contrast-sweep.spec.ts` + `on-accent-ink.spec.ts` sur `main` | **8/8 verts** |
| Sonde **pixels rendus** — 8 pages × 2 thèmes, 1440 px | **0 défaut réel** |

*Méthode de la sonde* : capture d'écran réelle → canvas → couleur de fond **effectivement
rendue** sous chaque nœud de texte (et non l'ancêtre DOM, qui ment dès qu'un calque frère
absolu se glisse entre les deux), comparée à la `color` calculée, seuils AA 4,5:1 / 3:1 selon
taille et graisse.

**Deux signaux levés, tous deux écartés après vérification** — ils auraient fait deux faux
positifs :

1. **« Créer le compte » sur `/register`**, blanc sur orange clairci, 2,62:1 (clair) / 3,12:1
   (sombre). **Le bouton est `disabled` avec `opacity: 0.6`.** WCAG 1.4.3 exempte explicitement
   les composants d'interface **inactifs**. Pas un défaut.
2. **« Chargement d'E-Code… »**, 1,69:1 à 3,63:1. Texte de l'**overlay de chargement**, mesuré
   en cours de fondu, avec un fond qui change d'une mesure à l'autre (`rgb(12,12,28)` sur
   `/features`, `rgb(244,116,20)` sur `/login`). Artefact de mesure, pas un état stable.

> ⚠️ **Correction d'une affirmation que j'avais faite trop vite.** En corrigeant les quatre
> faux amis (§7.3 bis), j'ai écrit avoir vérifié qu'aucune porte n'exigeait qu'une valeur FR
> diffère de l'EN. J'avais vérifié **deux** portes (`validate-catalogs.mjs`, `scan-source.mjs`)
> et manqué la troisième : `app/lib/i18n/catalogs/chat.spec.ts` exige que toute valeur FR
> identique à l'EN soit **explicitement documentée** dans une liste justifiée. La CI l'a
> attrapée (`expected [ 'extension', 'Extensions', …(2) ] to deeply equal []`). Les quatre
> termes y sont désormais déclarés **avec leur justification**. C'est une bonne porte : elle
> empêche qu'une chaîne reste anglaise par oubli, et elle a fait exactement son travail.

**Reste à couvrir sur ce groupe** : les utilitaires **UnoCSS** (`text-X` sur `bg-X/10`) ne
passent pas par `index.scss` et échappent donc au spec de dérivation ; la sonde pixels les
attrape, mais elle n'a tourné que sur 8 pages marketing, **sans les surfaces authentifiées ni
l'IDE** (le serveur local n'a pas d'API). Le cas « Commit changes » du panneau Git est couvert
par `on-accent-ink.spec.ts` (vert), mais **n'a pas été revu à l'écran** dans ce passage.

### 7.4 File reprise — état

| Chantier | État | Note |
|---|---|---|
| **1. Contraste** | ✅ **traité** (§7.3) | Déjà corrigé sur `main` ; dérivation depuis la feuille compilée vérifiée ; 0 défaut réel à la sonde pixels. Reste : UnoCSS + surfaces authentifiées. |
| **2. Terminal** — BUG-TERM-002, BUG-QUOTA-001 | 🔧 **code et gardes vérifiés ; reste la preuve live** (§7.6) | Aucune modification d'apparence : le correctif est déjà sur `main`, je n'ai touché à rien. |
| **3. 14 composants morts + 2 ressources orphelines** (`4e534565c`) | ⬜ **non commencé** | Prouver la mort de chacun (aucune référence vivante, commentaires exclus) **avant** suppression, par lots, preuve dans le message de commit. |

### 7.5 Prochaine reprise — dans cet ordre

1. **Rejouer les 10 panneaux sur du code courant.** L'env d'audit est inutilisable tel quel
   (128 commits de retard) : soit y reconstruire `deps` → `web` → `api` **en série** (le fan-out
   à 7 images y meurt en `INTERNAL_ERROR`, voir runbook §4.1), soit monter une API locale à côté
   du serveur web déjà en place. **Couvrir aussi le thème sombre et 768 / 1024 / 1440**, qui
   n'ont jamais été faits.
2. **Terminal** (chantier 2), puis **composants morts** (chantier 3).
3. Étendre la sonde pixels de contraste aux surfaces authentifiées et à l'IDE.

### 7.6 Terminal — BUG-TERM-002 et BUG-QUOTA-001

**Les deux sont déjà corrigés sur `main`.** Aucune ligne de produit n'a été modifiée par ce
balayage — et en particulier **aucune retouche d'apparence** : l'onglet Terminal/Shell mobile
reste gelé sur la référence d'Avi (IMG_9149).

| Bug | État du code sur `main` |
|---|---|
| **BUG-TERM-002** — le client forgeait un `sessionId` neuf à chaque connexion, donc le terminal ne se rattachait jamais et épuisait le budget `maxSessions` (8) | Corrigé : `packages/runtime-remote/src/index.ts:604` appelle `deriveTerminalId(request.sessionKey)`, identité **déterministe** par panneau. |
| **BUG-QUOTA-001** — le quota `terminals.concurrent` était décompté par connexion WebSocket et non par session | Corrigé par `e9d73b9b2` (« le créneau de quota appartient à la session, pas au socket »). |

#### La garde porte bien sur le vrai site d'appel — vérifié par contre-épreuve

C'était le point de vigilance : une garde précédente épinglait sa propre copie du composant.
Ici la structure est correcte, et je l'ai **prouvée en cassant le produit** plutôt qu'en la
relisant :

| Spec | Ce qu'il tient | Comment il le tient |
|---|---|---|
| `terminal-session-key.spec.ts` | la **dérivation** est déterministe | importe `deriveTerminalId` depuis `./terminal-session.js` — **le module que `index.ts` importe lui-même** (ligne 29), pas une copie |
| `terminal-session-wiring.spec.ts` | le produit **appelle réellement** cette dérivation | lit le **vrai `index.ts`** par `readFileSync` et vérifie le site d'appel |

**Contre-épreuve (01/09)** — j'ai remis le défaut d'origine au site d'appel
(`const terminalId = \`terminal-${Date.now()}-${Math.random()...}\``) :

| État | `terminal-session-key` | `terminal-session-wiring` |
|---|---|---|
| Code sain | ✅ 10/10 | ✅ |
| Site d'appel cassé | ✅ **reste vert** (la fonction est toujours correcte) | ❌ **2 tests échouent** |

C'est exactement la répartition voulue — **un test par mécanisme**. La garde de la fonction ne
masque pas la régression du câblage, et c'est le câblage qui était le vrai défaut. Fichier
restauré après la contre-épreuve.

**Ce qui reste** : la preuve **live** (attacher un shell, le fermer, le rouvrir, vérifier
`0 shell créé` au 2ᵉ rattachement et l'absence de 429). Elle est bloquée sur la même chose que
les panneaux — un environnement à jour. Reconstruction en cours, voir §7.7.

### 7.7 Reconstruction de l'environnement d'audit — en cours

Pour lever le blocage des panneaux **et** de la preuve terminal, l'env d'audit est en cours de
reconstruction sur `main` (`fce8639ab3`).

- **Build** `b289c6ec-309f-492c-b019-2ee08867770f`, projet `vibecore-audit-test-20260807`.
- **Méthode imposée par deux pièges du runbook** : (a) le contexte pèse 358 Mo dont 264 Mo de
  `docs/` qu'aucun Dockerfile ne lit, et le débit d'upload rend l'envoi impraticable → une étape
  `clone` fait **cloner le SHA par Cloud Build lui-même** (`--no-source`), démarrage immédiat ;
  (b) le fan-out à 7 images tue le worker sur ce projet à cache froid (`INTERNAL_ERROR`
  reproduit deux fois le 27/08) → **build en série** `deps` → `web` → `api` uniquement.
- ⚠️ Le bloc `images:` est conservé : sans lui le build serait **`SUCCESS` sans rien pousser**.
  Vérifier le push avec `gcloud artifacts docker tags list`, jamais le seul statut du build.

**Ne pas déployer soi-même** : une fois les images poussées, la bascule Helm de l'env d'audit
suit le runbook §4, avec `--kube-context` explicite — le nom de release ne protège de rien, la
release d'audit s'appelle `vibecore` comme la prod.
