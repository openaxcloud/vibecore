# Audit UI/UX IDE — desktop, prod live (2026-08-27) — LOT 1

**Terrain** : `https://app.e-code.ai/@org-dzj1djmz/create-a-polished-portfolio-with-5`, prod, session Avi, Chrome, viewport 1255×963, thèmes clair **et** sombre.
**Code de référence** : worktree sur `origin/main` (`9f5d8576`) — `/Users/hb/dev/vc-ideux`.

## Méthode et limites (à lire avant de me croire)

- Les mesures viennent du DOM rendu en prod (styles calculés, boîtes englobantes, `elementsFromPoint`), pas d'une lecture de code.
- **Deux faux positifs écartés en cours de route**, signalés ici pour que personne ne les re-« découvre » :
  1. Les captures **pleine page** de cet environnement renvoient parfois un *frame périmé* (panneaux blancs alors que le thème sombre est appliqué). Les **zooms** et les styles calculés font foi. Il n'y a **pas** de thème hybride clair/sombre.
  2. Un premier calcul de contraste a lu `color(srgb 0.49 0.52 0.56)` comme du 0-255 et a produit 11 faux échecs. Après correction : 2 échecs réels sur l'écran testé.
- Périmètre du lot 1 : panneaux Agent, Extensions, Git, Déploiements, Bibliothèque (arbre de fichiers), barre d'onglets, barre d'état. **Non encore audités** : éditeur, Webview, terminal, Base de données, Secrets, Paramètres, Journaux, états hover/focus/désactivé, tablette et mobile.

---

## P0 — bloquants

### P0-1 — La barre d'onglets se remplit toute seule jusqu'au catalogue complet des panneaux, et l'onglet actif finit hors écran

**Constat mesuré, sans aucune action de ma part** : en ~30 s, le nombre d'onglets est passé de **19 → 22 → 25**, et le panneau actif a changé seul : `Journaux` → `Collaborateurs` → `Domaines`. À 25, ça se stabilise : 25 = le catalogue entier des panneaux. Autrement dit, **tout panneau monté (y compris en arrière-plan) devient un onglet permanent**.

Preuves :
- `[role="tablist"]` : `scrollWidth = 3483 px` pour `clientWidth = 509 px` → **6,8× de débordement**, 3 onglets visibles sur 25.
- Position de l'onglet actif : **x ≈ 4 087 px** — très au-delà du strip visible. Aucun bouton de débordement, aucun défilement automatique vers l'actif.
- Ce n'est pas local : `GET /api/workspaces/ws-99f6ac563c2f9546/ide-state` renvoie `state.ui.paneTree.tabs.length = 25`. **C'est persisté côté serveur**, donc ça survit au rechargement et pollue durablement l'espace de travail. (Le `ide-state` *projet* n'en a que 5 → la divergence vient bien du niveau workspace.)

**Où** : `app/components/chat/BaseChat.tsx:5401` (`openWorkspacePanel` — ajoute un onglet à chaque ouverture de panneau), `app/components/chat/BaseChat.tsx:1870` (`makePaneTab` — id `tab-<panel>-<crypto.randomUUID()>`, donc jamais stable d'une session à l'autre), persistance via `ide-state`.

**Correction recommandée** :
1. Dissocier « monter un panneau » de « ouvrir un onglet » : seul un geste utilisateur explicite crée un onglet ; les montages de fond (rafraîchissement, préchargement) n'en créent aucun.
2. Ids stables `tab-<panel>` (et `tab-editor-<path>`) au lieu d'un UUID par ouverture — sinon aucune déduplication n'est possible entre deux sessions.
3. Plafonner la barre (LRU, ex. 12 onglets non épinglés) et **purger l'état serveur existant** une fois le correctif en place, sinon les workspaces déjà pollués restent à 25.
4. Barre d'onglets : `scrollIntoView` de l'onglet actif à chaque changement + chevrons de débordement + compteur « +N ».

### P0-2 — Les liens profonds `?panel=…` ne sont pas fiables

**Constat** : `?panel=agent` affiche le panneau **Extensions** (`[data-testid="ide-service-panel"][data-panel="extensions"]`, onglet « Extensions » `aria-selected="true"`). Après rechargement de `?panel=deployments`, l'écran affiche successivement **Sécurité**, **Git**, puis **Journaux** — l'URL, elle, reste `?panel=deployments`.

Deux causes cumulées :
- `app/utils/project-ide-panel-url.ts:5` — `readPanelSearchParam` renvoie `undefined` pour toute clé absente de la liste blanche : la valeur est **abandonnée en silence**, sans message ni correction d'URL. `agent` n'est pas dans `IDE_URL_PANELS` (`BaseChat.tsx:436-437`) alors que le panneau Agent existe bel et bien.
- L'auto-ouverture décrite en P0-1 **écrase** ensuite le panneau demandé par l'URL.

**Correction** : ajouter `agent` (et tout panneau réellement adressable) à la liste blanche ; au premier rendu, l'URL est prioritaire sur l'état persisté ; si la clé est inconnue, normaliser l'URL et le signaler plutôt que de l'ignorer.

---

## P1 — sérieux

### P1-3 — Deux accents concurrents : l'IDE est bleu, la marque est orange

| Jeton | Valeur live | Où |
|---|---|---|
| `--vc-ide-accent-action` | `#006fd6` | `app/styles/index.scss:499` (clair) / `:844` (sombre) |
| `--vc-action-primary` | `#006fd6` (alias) | `index.scss:500` / `:845` |
| `--bolt-elements-loader-progress` | `#006fd6` | `index.scss:683/1006` |
| `--vc-ui-focus-ring` | `#005fcc` | `index.scss:762` |
| `--ecode-accent` / `--ecode-orange` | **`#f26207`** | `index.scss:583/614` |

Conséquences visibles sur un seul écran : chip de modèle « Économique » en aplat bleu, badge de collaboration bleu, barre de progression de chargement bleue (`app/components/ui/PanelBoundary.tsx:246`), anneau de focus bleu — **et** le sous-onglet actif « Vue d'ensemble » du panneau Déploiements souligné en **orange**. Le même écran affirme donc deux couleurs d'action différentes.

**Correction** : trancher un accent unique pour l'IDE. Si c'est l'orange de marque, ne pas se contenter de remplacer le jeton : `#f26207` sur blanc plafonne à **3,4:1**, donc interdit pour du texte < 24 px ou des libellés sur aplat blanc. Prévoir la paire complète : aplat `#f26207` + texte `#1a1a1a`, et une variante texte/bordure foncée (`#c2410c`) pour tout ce qui doit passer AA.

### P1-4 — Le composer de l'Agent mange 43 % du panneau (demande d'Avi)

Mesures : panneau Agent `339 × 851 px` ; bloc composer `303 × **368 px**` (y 557→925) ; textarea 109 px. Il reste **~477 px** pour toute la conversation. L'empilement fait : chips Léger/Économique/Puissance → sélecteur « Avancé » + prix → phrase « Le juste équilibre. » → bouton « Planifier » → textarea → barre d'outils (6 icônes).

**Correction** (cible ≈ 120-140 px au repos, façon Claude) : une seule rangée de contrôles (modèle + mode fusionnés dans un menu compact), textarea auto-grow 1→8 lignes, prix et baseline déplacés en infobulle du menu modèle, actions secondaires sous « … ».

### P1-5 — ~~Pas de bouton « descendre en bas »~~ → **CONSTAT RETIRÉ** (faux négatif de ma part)

Le composant **existe** : `ScrollToBottom` (`app/components/chat/BaseChat.tsx:7189`), rendu en dernier enfant du transcript, `position: sticky; bottom: 12px` (`app/styles/index.scss:7012`), affiché dès que `isAtBottom` est faux.

Ma recherche initiale filtrait les libellés sur `bas|bottom|descendre|latest` ; le libellé réel est « Faites défiler jusqu'au dernier message » — aucun de ces mots. Et au moment du test, le transcript n'était pas défilable (`scrollHeight` 787 vs `clientHeight` 773, soit 14 px de dépassement), donc le bouton n'avait aucune raison d'exister.

**Réserve, à trancher avec une vraie conversation longue** : après avoir rendu le conteneur défilable de force (383 px de contenu dans 180 px de fenêtre) et l'avoir remonté en haut (`scrollTop = 0`), le bouton est resté absent du DOM. Ce peut être un artefact de ma manipulation (la bibliothèque `use-stick-to-bottom` recalcule `isAtBottom` sur ses propres mesures). **Non conclu** : à retester sur un transcript réellement long avant d'affirmer quoi que ce soit.

### P1-6 — La rangée de suggestions est coupée net

Les boutons de suggestion débordent du panneau : bouton à `x=262, w=212` → fin à **474 px** alors que le panneau s'arrête à **388 px**. À l'écran : « Continuer la dernière d… », « Exécuter l'ape… » tranchés au milieu d'un mot, sans indicateur de défilement.
**Correction** : passer la rangée en `flex-wrap` (2 lignes max) ou en carrousel avec dégradé de bord + chevrons ; jamais de troncature muette au ras du conteneur.

### P1-7 — Des composants explicitement « mobile » sont rendus en desktop

3 occurrences de `.bolt-assistant-message-mobile-head` (largeur 303 px) rendues à un viewport de **1255 px**.
**Où** : `app/components/chat/AssistantMessage.tsx:311`.
**Correction** : conditionner ce bloc au vrai point de rupture (ou le neutraliser au-dessus de `md`), et ajouter un test qui échoue si un nœud `*-mobile-*` est visible ≥ 1024 px.

### P1-8 — Le code inline colle au texte

`app/components/chat/Markdown.module.scss:89-101` : `:not(pre) > code` reçoit `border-radius: 6px`, `padding: .2em .4em` et un fond, mais **aucune marge horizontale**. La pastille teintée démarre donc au ras du mot précédent.
**Correction** : `margin: 0 .15em;` sur la même règle (et `margin-inline` pour rester correct en RTL).

---

## P2 — à corriger, non bloquant

### P2-9 — Contrastes sous AA (thème sombre, écran testé)
Balayage de 176 éléments texte, fond réel échantillonné via la pile d'éléments peints :
- Bouton **« Arrêter »** : blanc sur `#f85149` = **3,35:1** (AA exige 4,5:1 à 12 px). C'est une action destructive : elle doit être la plus lisible de l'écran. Correction : `#b42318` en fond, ou texte `#1a1a1a` sur le rouge actuel.
- Séparateur de fil d'Ariane « › » : **3,57:1** (`.bolt-project-breadcrumb-separator`). Correction : monter l'opacité à 1 et utiliser le gris texte tertiaire du thème.

### P2-10 — Fautes de langue et chaînes non traduites
- « **Economy** » non traduit dans le catalogue **FR** : `app/lib/i18n/catalogs/assistant-message.ts:141` — alors que le composer affiche « Économique » pour le même palier. Deux noms pour une même chose, dont un en anglais.
- « **Chargement de extensions…** » : élision manquante + nom de panneau brut passé en minuscules. `app/components/chat/BaseChat.tsx:10906` (`t('chat.copy.loadingValue0_99abf3e6', { value0: title.toLowerCase() })`). Correction : utiliser le libellé localisé du panneau et une formulation neutre (« Chargement du panneau Extensions… »).
- Bouton **« Ouvert »** dans Déploiements là où l'action est « **Ouvrir** » (participe passé au lieu de l'impératif).

### P2-11 — États de chargement incohérents d'un panneau à l'autre
Le panneau **Git** affiche une seule ligne de texte gris centrée dans un vide de ~800 px (« Chargement du statut Git de l'espace de travail… »), alors que les autres panneaux utilisent `PanelLoading` (spinner + barre de progression + squelette, `app/components/ui/PanelBoundary.tsx:224`).
**Correction** : router tous les panneaux vers `PanelLoading`.

---

## Corrections apportées à ce rapport après vérification

| Constat initial | Vérification | Statut |
|---|---|---|
| P1-5 « aucun bouton descendre en bas » | Le composant `ScrollToBottom` existe et est conditionnel à `isAtBottom` ; mon filtre de libellé et un transcript non défilable m'avaient trompé | **Retiré** (réserve à retester) |
| « doublon `'problems'` dans `IDE_MANAGEMENT_PANELS` » (signalé en revue) | Tableau désassemblé sans les commentaires : **une seule** entrée. La seconde occurrence est dans le commentaire (`openBottomTerminal('problems')`) | **Non fondé**, test de garde ajouté |
| « thème hybride clair/sombre » (suspecté en cours d'audit) | Styles calculés : toutes les surfaces sont sombres. Les captures pleine page renvoyaient un frame périmé | **Faux positif écarté** |

## Suite du lot 2 (non encore fait)

Éditeur, Webview, terminal, Base de données, Secrets, Paramètres, Journaux ; états hover/focus/actif/désactivé/vide/erreur ; sweep de contraste en **clair** sur tous les panneaux ; densité comparée des cartes de panneaux ; tablette et mobile.
