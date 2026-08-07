# Vérification LIVE de la boucle produit — app.e-code.ai — 2026-07-31

Compte jetable : product-loop-qa-0731@e-code.ai · org cms8lgje800350negk3oumwe5 · projet `a-tip-calculator-bill-amount` (cms8lljd8003i0nco67h1507s) · workspace ws-9b7db5c12096a4af.
Navigateur : Playwright/Chromium headless piloté via CDP. Auth : cookie `vc_session` injecté (pas de formulaire) — dashboard confirmé connecté (`q0-dashboard-authed.png`).

Écoute continue `pageerror` + `console.error` -> `pageerrors.log`.

---

## Q1 — Prompt -> app dans la preview : **OK (mais débloqué manuellement)**

- Prompt réel envoyé via « Start with the agent » : *« A tip calculator: bill amount, tip %, split between people... Vite + React. »*
- L'agent a généré une vraie app (23-25 fichiers : composants, hooks, `lib/calculate.ts`, tests, config Vite/TS) avec un plan à 4 lanes.
- **Preview = vrai runtime**, pas du HTML statique : iframe `https://ws-9b7db5c12096a4af-5173.preview.e-code.ai/`, fetch HTTP **200** (HTML Vite + shim HMR), 200 aussi en anonyme.
- **Interaction réelle dans l'app** : saisi 120 $, tip 20 % -> l'app calcule « EACH PERSON PAYS 36,00 $ / Total tip 24,00 / Total bill 144,00 ». (`q1-interaction.png`)
- **Réserve honnête sur le temps** : la génération des fichiers a pris quelques minutes, MAIS le workspace est resté **PENDING** parce que les pods workspace-manager ont redémarré pendant le test (redeploy concurrent). Le coordinateur a dû lancer manuellement un `/restart` vers 10:45 pour que le runtime monte ; la preview n'a affiché l'app qu'après. Donc prompt -> app-qui-tourne **n'a pas été 100 % automatique** dans ce run.

## Q2 — Database comme Replit : **PARTIEL — pas au niveau Replit**

- L'app a bien reçu « Save calculation » + « Saved history » : enregistrement d'un calcul -> apparaît dans l'historique -> reload -> **persiste**. (`q2-saved-entry.png`, `q2-persist-after-reload.png`)
- **MAIS le stockage est de l'IndexedDB navigateur, pas le Postgres de la plateforme.** Le pied de page de l'app le dit noir sur blanc : *« saved to a durable in-browser database. Connect Supabase to persist to platform Postgres. »* L'agent (transcript) a supposé un WebContainer, a écrit *« no platform database is currently connected »* et a utilisé un adaptateur IndexedDB — il n'a **pas** câblé la base Postgres de la plateforme.
- Le test « redémarre le runtime -> données restent » n'est pas probant ici : l'IndexedDB étant côté navigateur, elle survit au reload quoi qu'il arrive ; ça ne prouve pas une persistance serveur.
- **Panneau Database** : le bouton « Create database » (1 clic) **crée réellement une instance Postgres côté serveur** (POST -> instance `cms8uh08y00mz0mat0sp2tcmi`, statut PROVISIONING, engine postgres). **DÉFAUT** : le panneau ne montre jamais cette instance (le GET renvoie `connections:[]`, instance absente) — l'UI reste sur « No database yet ». Donc **aucun SQL pane / table / donnée n'est accessible via l'UI**.

## Q3 — Déploiement en ligne réel : **PARTIEL — URL publique servie, mais page blanche pour les visiteurs**

- Le pipeline est réel : Publish -> détection « static » -> sandbox de build isolé -> `npm install` -> `tsc && vite build` -> hébergement statique sur le CDN E-Code.
- **1er essai : ÉCHEC (exit 2)** sur une vraie erreur TS du code généré par l'IA : `src/types/domain.ts(5,6): error TS1010: '*/' expected` (commentaire non fermé). Le dev server Vite masque ça (pas de typecheck) ; le build de prod le voit. **Trouvaille : l'IA peut générer du code qui tourne en preview mais casse le build de prod.**
- Correctif : un court prompt à l'agent a fermé le commentaire.
- **2e essai : ÉCHEC rapide « No package.json found »** — le workspace était déconnecté à ce moment (instabilité redeploy concurrent), le deploy ne pouvait pas lire les fichiers.
- **3e essai (après restart du runtime) : build OK**, déploiement `cms8xgpft001f0mi5iebn0zml`.
  - URL publique : `https://api.e-code.ai/static-deployments/cms8xgpft001f0mi5iebn0zml/`
  - **Test anonyme (sans cookie)** : HTTP **200**, vrai HTML buildé (`<title>SplitWise Tip Calculator</title>`, assets Vite hashés), JS 200/158 Ko, CSS 200/10 Ko. -> **c'est bien public et ça sert le bundle**.
- **DÉFAUT page blanche** : rendue dans un navigateur propre, la page est **BLANCHE**. Cause : l'hébergement statique envoie `content-security-policy: sandbox allow-scripts allow-forms allow-popups allow-modals` (**sans `allow-same-origin`**). Ce sandbox bloque `localStorage` ; l'app lit `localStorage` au render (thème/historique) et lève `SecurityError`, donc React ne monte jamais. Le **même code s'affiche bien dans la preview de l'IDE** (servie sans ce sandbox). (`q3-public-anon-render.png`)

## Q4 — Tous les panneaux

| Panneau | Verdict | Preuve |
|---|---|---|
| Fichiers (Library) | OK | Arbre navigable, ouverture fichiers ; boutons New file/folder/Refresh ; edit+save = `PUT files/write 204`. Create via UI non concluant (reload). |
| Éditeur (Monaco) | OK | Rendu du contenu ; marqueur tapé dans README + Cmd+S -> `PUT files/write 204`. HMR observé indirectement (fix domain.ts reflété en preview). `q4-editor-edit-save.png` |
| Preview (Webview) | OK | Iframe runtime réel, interaction, toggles Desktop/Tablet/Mobile, Copy/Open/DevTools. `q1-preview-running.png` |
| Console / Output / Logs | OK | Onglets Console/Workflow/System, live tail, logs de build du deploy lisibles. `q2-logs-panel.png` |
| Shell / Terminal | **CASSÉ (cette session)** | Panneau présent + « reconnect », mais le shell **ne s'est jamais connecté** (bloqué « Connecting to workspace… ») malgré runtime Running + dev actif. `ls`/`node -v` impossibles. `q4-terminal-final.png` |
| Problems | OK | Compteurs (2 erreurs, 4 warnings), cliquable. |
| Git | OK | Statut (27 fichiers), Stage/Discard, Commit auteur nom/email, Commit / Commit & push, Connect GitHub/GitLab/Bitbucket, Add remote. `q4-git-panel.png` |
| Database | **PARTIEL/DÉFAUT** | Provisionne une vraie instance Postgres côté serveur mais le panneau ne l'affiche jamais ; pas de SQL pane/tables. `q2-db-provisioned.png` |
| Secrets | OK | Ajout `QA_TEST_SECRET` (`POST secrets 200 {ok:true}`), listé, valeur **masquée** ensuite. `q4-secret-after-enter.png` |
| Deployments | OK | Liste déploiements + statut + URL, Publish/Republish, sélecteur d'env, env vars, custom domain, Logs. `q3-deploy-failed.png` |
| Monitoring | PARTIEL | Panneau présent (badge « 3 project errors ») mais détail bloqué « Loading » quand le runtime décrochait. |
| Packages | PARTIEL | Panneau présent mais bloqué « Loading packages » pendant l'instabilité workspace. |
| Settings | OK | Sections Project/Security/AI/Account (plan, usage, billing, credentials IA, prefs IDE), Export project. `q4-settings.png` |
| Agent | OK | Génération, plan 4 lanes, modes Lite/Economy/Power/Advanced, historique de conversation, compteur tokens/coût. `q2-agent-final.png` |
| History / Timeline | PARTIEL | Sous-onglet « Timeline » (façon VS Code) + historique de conversation + snapshots (quota). Restore de checkpoint non exercé. `q4-timeline-history.png` |
| Ports | **ABSENT** | Pas de panneau Ports dédié ; le port 5173 apparaît seulement dans la barre Webview/statut. |

---

## Verdict simple pour Avi (sans jargon)

- **Q1 — Faire une app en décrivant l'idée** : **Oui, ça marche** — l'IA a écrit une vraie app et elle tourne dans l'aperçu, on peut taper un montant et voir le calcul. Un seul bémol : ce jour-là le moteur qui fait tourner l'app s'est bloqué et il a fallu le relancer à la main.
- **Q2 — Base de données comme Replit** : **Pas encore comme Replit.** L'app enregistre bien un historique et il reste après rechargement, **mais** les données sont stockées dans le navigateur, pas dans une vraie base Postgres. Et le panneau « Database » crée bien une base côté serveur mais ne l'affiche jamais, donc on ne voit ni tables ni SQL. Deux choses à corriger.
- **Q3 — Mettre en ligne** : **Oui pour l'adresse publique, mais la page est blanche pour les visiteurs.** L'app se déploie sur une vraie URL publique, sauf que la plateforme la sert dans un « bac à sable » qui bloque la mémoire du navigateur ; comme l'app générée s'en sert, elle affiche une page blanche. (Au passage, le 1er déploiement a échoué à cause d'une faute de frappe dans le code de l'IA que l'aperçu ne montrait pas.)
- **Q4 — Les panneaux** : **La plupart marchent** (Fichiers, Éditeur, Aperçu, Logs, Git, Secrets, Déploiements, Réglages, Agent). **Le Terminal n'a pas voulu se connecter** de toute la session, **la Database ne s'affiche pas**, **Packages/Monitoring** n'ont pas fini de charger, **Ports n'existe pas**.

## À signaler au coordinateur (blocages / infra)
- Instabilité runtime récurrente (workspace-manager qui redémarre pendant les redeploys) : a causé le PENDING de Q1, l'échec « No package.json » de Q3, et probablement le terminal qui ne se connecte pas.
- 429 « rateLimitPerMinute:120 » après les prompts = normal (pas le quota IA).
- 429 `snapshots.count QUOTA_EXCEEDED` pendant les auto-snapshots de l'agent (plan free).
- **2 vrais défauts produit à remonter** : (1) panneau Database ne surface pas l'instance provisionnée ; (2) CSP `sandbox` sans `allow-same-origin` sur l'hébergement statique -> toute app utilisant localStorage s'affiche blanche en prod (or les apps générées par l'IA utilisent localStorage par défaut).

## Non testé (et pourquoi)
- Commandes shell (`ls`/`node -v`) : terminal jamais connecté.
- SQL pane / tables / CRUD Postgres réel : panneau n'a jamais montré la base.
- Persistance base serveur après restart : l'app utilisait IndexedDB navigateur -> non applicable.
- Création de fichier via l'UI : tentative auto interrompue par un reload.
- Détail Packages/Monitoring : bloqués en chargement pendant l'instabilité.
- Déploiement en env Production (fait en Preview).
