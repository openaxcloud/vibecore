# Point panneaux IDE — état de la connaissance

> **Régénéré à chaque passage du balayage QA continu.**
> Dernière régénération : **2026-09-01**, balayage QA continu.

---

## ⚠️ 1. Écart de version — lisez ceci avant toute conclusion

**La production ne tourne PAS le code de `main`, et l'environnement d'audit tourne un code
encore plus ancien que la production.** Tout constat ci-dessous doit être lu à travers cet écart.

| Surface | SHA déployé | Date du commit | Retard vs `main` |
|---|---|---|---:|
| `main` (référence) | `7fe97070b` | 01/09 13:15 | — |
| **prod `api`** | `17fe73df55` | 01/09 03:38 | **26 commits** |
| **prod `web`** | `e597a021ab` | 31/08 22:46 | **28 commits** |
| **env d'audit `web` + `api`** | `040dd2976d` | 27/08 07:59 | **128 commits** |

Trois conséquences, toutes gênantes :

1. **La prod est hétérogène.** `web` est **2 commits derrière** son propre `api`. L'interface
   observée en production n'est donc pas celle de `main`, ni même celle de l'API qui la sert.
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
