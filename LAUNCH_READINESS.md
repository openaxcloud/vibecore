# LAUNCH_READINESS — audit mise en prod

Verdicts de mise en production, panneau par panneau, établis **en réel sur `app.e-code.ai`**
(compte jetable + projet neuf, supprimés après). Un panneau ne passe ✅ que si la fonction a
été **exercée** et le résultat **observé**, pas seulement affiché.

Légende : ✅ marche en réel · ⚠️ marche partiellement / à décider · ❌ cassé.

---

## CLUSTER D — Problems, Debugger, History/Snapshots, Skills, Workflows, Agent Studio, Paramètres projet

**Date** : 2026-08-06 · **Environnement** : `app.e-code.ai` (prod) · **Compte** : jetable
`qa-clusterd-****@qa.e-code.ai`, org + projet « QA Cluster D » créés puis supprimés ·
**Runtime** : `remote-kubernetes`, workspace `ws-9ea846f331d5b334` · **Formats** : web 1280 /
tablette 768 / mobile 390, clair + sombre.

### Matrice

| Panneau | Verdict | Ce qui a été exercé | Preuve |
|---|---|---|---|
| **Problems** | ⚠️ | Erreur réelle introduite puis corrigée | L'erreur **apparaît** (8 s) ; elle **ne disparaît jamais** après correction → BUG-IDE-003 ; pas de lien vers la source → BUG-IDE-004 ; **aucune erreur TS/lint** n'y arrive → GAP-IDE-A |
| **Debugger** | ⚠️ | Config de lancement, breakpoint conditionnel, watch, démarrage de session | Config/breakpoint/watch **persistent** ; le lancement **s'exécute vraiment** dans le runtime ; **impossible de s'arrêter sur un breakpoint ou d'inspecter** → GAP-IDE-B ; statut de session figé → BUG-IDE-005 |
| **History / Snapshots** | ✅ | Checkpoint → modification → restauration | Contenu de `src/App.tsx` **revenu**, `src/main.tsx` **supprimé puis restauré**, fichier parasite **retiré** ; checkpoint de sécurité auto « Before restore of … » |
| **History / Activity** | ❌ → corrigé | Ouverture du panneau | **Crash à chaque ouverture, en prod, depuis le 2026-07-05** → BUG-IDE-001 (P0) |
| **Skills** | ✅ | Activation d'une skill puis exécution agent | Le toggle **persiste** (API) **et atteint l'agent** : interrogé, l'agent a listé exactement les 5 skills activées, dont celle qu'on venait d'activer |
| **Agent Studio** | ⚠️ | Ouverture après activité agent réelle (édition de fichier appliquée) | Superviseur **lecture seule** ; ses 3 sources restent vides même après une édition agent réussie → GAP-IDE-C ; titre/état vide mal libellés → BUG-IDE-002 |
| **Workflows** | ✅ | Création d'un workflow puis exécution | `SUCCEEDED`, `exit 0`, 727 ms, **sortie réelle capturée** (`WORKFLOW_RAN_OK`, `sum 4`) ; le workflow intégré remonte aussi un vrai `failed` avec la stderr Vite |
| **Paramètres projet** (7 onglets) | ✅ | Project · Security · AI · Usage · Account · Memory · Preferences | Les 7 affichent des données réelles ; écriture **persistée** (description → API → survit au rechargement) |

### Responsive & thème — 60 mesures

| Série | Combinaisons | Débordement horizontal | Crash |
|---|---|---|---|
| Sombre (défaut) | 7 panneaux × web/tablette/mobile = 42 | **0 partout** | `Activity` sur les 6 formats |
| Clair (Preferences → Theme → Light) | 6 panneaux × web/tablette/mobile = 18 | **0 partout** | aucun |

`document.scrollWidth === clientWidth` sur les 60 mesures : la page ne scrolle **jamais**
horizontalement. Les éléments larges (barre d'onglets, en-tête sticky) scrollent dans leur
propre conteneur, ce qui est le comportement voulu. En clair : `data-theme="light"`,
`bg rgb(246, 248, 251)`, contraste et contrôles corrects sur les 3 formats.

`Activity` a crashé sur **les 6** combinaisons sombres — le crash est universel, pas un cas de
bord. BUG-IDE-002 (titre en minuscules) est également visible dans les deux thèmes.

Note thème : l'IDE **ignore `prefers-color-scheme`** ; le thème est une préférence **par projet**
(Paramètres → Preferences → Theme), par défaut sombre, et elle fonctionne. Choix produit, pas
un bug — mais un visiteur en thème clair système garde une IDE sombre jusqu'à ce qu'il trouve
le réglage.

---

## Bugs

### BUG-IDE-001 — P0 — le panneau Activity crashe à chaque ouverture · **corrigé** (PR #120)
`ReferenceError: FilterChip is not defined`, rattrapé par la panel boundary → « The Activity
panel crashed ». En prod, pour tout le monde, depuis `dfeedd8b` (2026-07-05) : ce commit a
ajouté la rangée de chips de filtre sans ajouter l'import.

**Pourquoi la CI ne l'a pas vu** : `app/components/chat/BaseChat.tsx` porte `// @ts-nocheck`.
Ni `tsc` ni la CI ne peuvent voir un identifiant non défini dans ce fichier — qui contient
pourtant **la totalité des panneaux de l'IDE**. Retirer ce `@ts-nocheck` est hors périmètre de
cet audit mais reste le vrai correctif de fond.

### BUG-IDE-002 — P2 — des panneaux affichent leur identifiant brut · **corrigé** (PR #120)
`panelTitle()` n'avait pas d'entrée pour `skills`, `studio` ni `ports`, donc le repli `?? panel`
laissait fuiter l'id dans l'onglet, le titre et l'état vide : littéralement « studio » et
« No studio yet ». Visible sur desktop uniquement — le mobile lit déjà `ECODE_MOBILE_TAB_META`,
qui nomme correctement chaque panneau. Le correctif fait pointer `panelTitle()` sur cette même
table plutôt que d'entretenir une seconde liste qui redivergera.

### BUG-IDE-003 — P1 — Problems ne se vide jamais après correction · **corrigé** (PR #120)
`workspaceLogs` est un tampon circulaire en append-only et rien ne retirait une erreur de
transformation Vite **résolue**. Un fichier réparé conservait donc un compteur d'erreurs rouge
pour le reste de la session.

Preuve : `src/App.tsx` cassé depuis le shell du workspace → l'erreur apparaît en 8 s ; fichier
réparé → **la même erreur, au même horodatage (3:08:59 PM), toujours affichée 100 s plus tard**.
Seul un rechargement de page la fait partir.

Correctif : `buildRuntimeDiagnostics` retire les erreurs de build d'un module dès qu'un
`hmr update` / `page reload` ultérieur de ce module prouve qu'il se transforme à nouveau.
Balayage ordonné → recasser le fichier le re-signale ; une exception runtime n'est jamais
retirée (seules les erreurs de build nomment un module qui *peut* guérir).

### BUG-IDE-004 — P2 — pas de lien « aller à la ligne » sur les erreurs Vite · **corrigé** (PR #120)
Le motif de localisation ne reconnaissait que `fichier:ligne`, alors que Vite/babel écrivent
`fichier: <raison> (ligne:colonne)` — la classe d'erreur la plus fréquente ici. Chaque ligne
Problems concernée s'affichait sans lien alors que le message donnait fichier **et** position.

### BUG-IDE-005 — P2 — les sessions de debug restent « running » indéfiniment · **corrigé** (PR #120)
`start-session` écrit le statut une fois ; seul un arrêt explicite le réécrivait. Un lancement
qui se termine une seconde plus tard (normal pour un script, habituel pour un plantage)
continuait d'afficher « running » avec un bouton Stop actif. Le loader du Debugger récupère
déjà la liste des processus vivants du workspace : on réconcilie contre elle **en lecture**.
Sûr par défaut : une liste de processus illisible ne déclasse rien.

---

## Décisions à prendre (non corrigé — choix produit)

### GAP-IDE-A — Problems n'a **aucune** source TypeScript ni lint
Seules les lignes de log runtime/build sont remontées. Une vraie erreur de types
(`const broken: number = "definitely not a number"`, syntaxe valide) donne **0 problème** :
esbuild efface les types sans les vérifier et aucun `tsc`/ESLint ne tourne côté workspace.

Un utilisateur qui lit « Problems : 0 » sur du code qui ne compile pas est mal informé.
**À arbitrer** : brancher un `tsc --watch` / ESLint dans le workspace, ou renommer le panneau
pour ce qu'il fait réellement (diagnostics d'exécution).

### GAP-IDE-B — le Debugger ne peut pas s'arrêter sur un breakpoint
Ce qui marche vraiment : configurations de lancement, breakpoints (avec condition, hit count,
logpoint), expressions de watch — tout persiste — et « Start debugging » **exécute réellement**
la commande dans le workspace.

Ce qui ne peut pas marcher : aucun adaptateur DAP n'est branché. `callStack` et `variables` ne
sont assignés qu'à `[]` dans tout le code, et rien ne met jamais une session à `paused` ; les
boutons `continue / step over / step into / step out` sont donc **définitivement désactivés**,
et les expressions de watch ne sont jamais évaluées. L'UI est honnête sur la condition
(« Stepping is enabled when a debug adapter reports a paused frame ») mais cette condition est
inatteignable.

**À arbitrer** : brancher un adaptateur (node inspector / debugpy), ou retirer les affordances
de stepping et assumer « lanceur de processus + carnet de breakpoints ».

### GAP-IDE-C — Agent Studio est vide sur un projet sain
Le panneau agrège 3 flux : propositions de patch, événements d'auto-réparation, votes de
consensus. Après une édition agent **réussie et appliquée**, les trois restent vides — ils ne
se remplissent que sur les chemins d'échec / de revue. Un utilisateur normal ne verra donc que
l'état vide. Le panneau ne permet pas non plus de **créer** un agent : c'est un superviseur en
lecture seule (le comportement agent se règle dans Paramètres → AI et dans le composeur).

**À arbitrer** : soit alimenter le panneau avec l'activité agent nominale (runs, patchs
appliqués, branches de conversation), soit le renommer / le fusionner.

---

## Observations non bloquantes

- **Restauration de snapshot sans confirmation** : « Restore » s'exécute immédiatement, sans
  dialogue, alors que l'action réécrit tout l'arbre du workspace. Atténué par le checkpoint de
  sécurité « Before restore of … » créé automatiquement — donc récupérable. P3.
- **Workflow « Run development server » en échec** quand le serveur tourne déjà : `Port 5173 is
  already in use`. Comportement correct du workflow (il remonte la vraie stderr), mais le
  bouton Run principal échoue systématiquement sur un projet dont la preview est déjà démarrée.
  Déjà connu côté runtime.
- **`GET /api/projects/:id/thumbnail` en 404** dans la console de l'IDE — déjà consigné
  (BUG-USR-002).

---

## Annexe — traces d'exercice (cluster D)

**Problems**
```
# 1. code valide
Open Problems. 0 errors, 4 warnings.

# 2. erreur de TYPES seule (syntaxe valide) — printf > src/App.tsx depuis le shell
const broken: number = "definitely not a number";
Open Problems. 0 errors, 4 warnings.      <-- GAP-IDE-A : jamais remontée

# 3. erreur de syntaxe
Open Problems. 1 errors and 4 warnings.
Error runtime
3:08:59 PM [vite] Pre-transform error: /workspace/src/App.tsx: Unterminated JSX contents. (1:60)
jump links: []                            <-- BUG-IDE-004 : aucun lien

# 4. fichier réparé, même session (pas de rechargement)
fixed t=10s .. t=100s -> Open Problems. 1 errors and 4 warnings.
Error runtime
3:08:59 PM [vite] Pre-transform error: ... (1:60)   <-- BUG-IDE-003 : identique, même horodatage
```

**Snapshots**
```
$ printf 'MUTATED_AGAIN\n' > src/App.tsx; rm -f src/main.tsx; ls src
App.tsx  App.tsx.bak  styles.css
MUTATED_AGAIN

# clic Restore sur le checkpoint
$ ls src; head -3 src/App.tsx; test -f src/main.tsx && echo MAIN_RESTORED
App.tsx  App.tsx.bak  main.tsx  styles.css
export default function App() {
  return (
    <main className="app-shell">
MAIN_RESTORED
```

**Skills** — agent interrogé après activation de « Documentation » :
```
Code Review (quality), Test Generation (quality), Debugger (quality),
Refactor (productivity), Documentation (productivity)
```
soit exactement les 5 skills que l'API renvoie `enabled: true`, dans le même ordre.

**Workflows** — workflow créé puis lancé depuis le panneau :
```
SUCCEEDED   echo WORKFLOW_RAN_OK; node -e "console.log('sum', 2+2)"   exit 0   727ms
WORKFLOW_RAN_OK
sum 4
```

**Debugger** — après « Start debugging » :
```
QA node inspector
node --inspect-brk=0.0.0.0:9229 -e "..."
running
[{t:'continue',   disabled:true, title:'Stepping is enabled when a debug adapter reports a paused frame.'},
 {t:'step over',  disabled:true, ...}, ...]
Call stack and variables: No paused frame.
```
Le processus lancé se termine en quelques millisecondes ; le statut restait `running`
(BUG-IDE-005). Aucun code du dépôt n'assigne jamais `callStack` / `variables` autrement que
`[]`, ni ne met un statut à `paused` (GAP-IDE-B).

**Agent Studio** — après une édition agent réussie et appliquée (`Edit src/App.tsx (targeted
patch) Done 2.5s`) :
```
GET /projects/:id/agent-patch-proposals   200 {"proposals":[]}
GET /projects/:id/agent-repair-events     200 {"events":[]}
GET /projects/:id/agent-consensus         200 {"records":[]}
Panneau : « No studio yet »
```

**Paramètres** — persistance vérifiée de bout en bout :
```
description écrite dans l'UI : qa-cluster-d-1786031744145
GET /projects/:id  ->          qa-cluster-d-1786031744145
après rechargement, champ =    qa-cluster-d-1786031744145
```
