---
id: BUG-UX-AGENT-MENU-FOCUS-001
section: "2026-10-21 — Recette UX locale des panneaux"
---

## Bug

Le menu desktop « More agent actions » / « Plus d'actions d'agent » s'ouvre
avec Entrée mais laisse le focus sur son déclencheur. Flèche bas ne déplace
pas le focus dans les actions. Reproduit sur le build de
`4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`, Chromium système 154.0.8037.57,
1440 × 900, vraie API Fastify et PostgreSQL local dédié.

La mesure enregistrée dans [before.json](ux-menu-2026-10-21/before.json)
porte `inMenu: false` après Entrée et après Flèche bas.
[Capture avant](ux-menu-2026-10-21/before-desktop.png).

## Correction

`HeaderOverflowMenu.tsx` prend le focus à l'ouverture, navigue entre les boutons
avec les flèches et Home/End, ferme avec Escape et rend le focus au déclencheur.
Tab ferme le menu pour poursuivre la navigation ; le départ du focus et le clic
extérieur ferment également le menu. Aucune action supprimée, aucune route
modifiée, aucun changement du moteur BaseChat/Monaco ni du socle mobile.

## 📤 Dispatché

☑ lot UX parallèle, branche `fix/panel-ux-accessibility-20261021`.

## 💻 Codé

☐ non intégré à main ; correctif de branche destiné à une PR brouillon, sans fusion autonome.

## ✅ Testé live

☐ aucune certification production. Recette locale : 12/12 parcours navigateur réussis.

## Recette reproductible

Voir `tests/e2e/agent-header-menu-keyboard.spec.ts`. La recette standard crée
ses données de test via la vraie API comme les autres E2E. Pour une session
synthétique sans mot de passe de connexion, le harnais local non publié
`.vibecore/ux-qa/api.ts` utilise exclusivement
`127.0.0.1:55443/vibecore_ux_20261021`, refuse une autre cible et écrit
le fichier privé `.vibecore/ux-qa/session.json` (mode 0600).
La session expire après deux heures. Ne jamais publier ce fichier.

Préparation locale : image `pgvector/pgvector:pg16`, migrations Prisma et seed
du dépôt, puis fixture avec `NODE_ENV=test`, `API_CORS_ORIGINS` pointant sur
l'origine web locale et `PROJECT_STORAGE_DIR` dans `.vibecore/ux-qa/projects`.
L'image employée est
`sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a`.
La fixture lance l'API réelle sur 3013. Servir `npm run build` avec
`react-router-serve build/server/index.js`, `SAAS_API_URL=http://127.0.0.1:3013`.
Passer `UX_QA_SESSION_FILE` au test pour utiliser cette identité synthétique.

L'environnement ne provisionne ni Kubernetes, ni fournisseur IA, ni déploiement.
Ses états de runtime indisponible ne valent pas recette fonctionnelle de ces
services. Aucun mock réseau ou résultat fournisseur n'est utilisé.

La spec persiste un unique message **utilisateur** synthétique via les routes
de conversation/transcription et attend son affichage réel, comme la recette
existante `palette-se-ferme-au-clic-ailleurs.spec.ts`. Ce témoin distingue le vrai
chat de `PendingComposerShell`, qui affiche les mêmes commandes puis est démonté.
Ce n'est ni un envoi à un modèle, ni une réponse IA fabriquée.

Exécution contre le build compilé, avec un navigateur Playwright installé :

```sh
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5196 \
SAAS_API_URL=http://127.0.0.1:3013 \
UX_QA_SESSION_FILE=/workspace/vibecore/.vibecore/ux-qa/session.json \
node_modules/.bin/playwright test tests/e2e/agent-header-menu-keyboard.spec.ts
```

La configuration locale temporaire a utilisé `/usr/bin/chromium` (154.0.8037.57),
un worker, zéro retry, 30 s par cas et les trois viewports du tableau ci-dessous.
La CI standard utilise son propre navigateur épinglé ; aucune configuration CI
n'a été modifiée. Sans `UX_QA_SESSION_FILE`, la spec inscrit ses identités jetables
via l'API locale comme les autres E2E.

## Matrice vérifiée sur le build local

Chaque ligne passe en EN **et** FR. Les tests vérifient les effets, pas seulement
l'existence des boutons. [Journal exact](ux-menu-2026-10-21/playwright.txt).

| Format | Actions et effets vérifiés | Preuves |
| --- | --- | --- |
| Desktop 1440 × 900 | Entrée → focus première action ; flèches avec bouclage ; Home/End ; Escape → menu fermé et focus rendu ; ouverture par Flèche haut ; Tab → menu fermé et focus sur la commande suivante | [EN](ux-menu-2026-10-21/after-desktop-en.png), [FR](ux-menu-2026-10-21/after-desktop-fr.png) |
| Tablette 768 × 1024 | Toucher options → dialogue ; toucher fermer → dialogue masqué ; socle Webview → URL preview, puis Agent → URL canonique, onglet actif et commande visible ; cible Agent ≥ 44 px | [EN](ux-menu-2026-10-21/after-tablet-en.png), [FR](ux-menu-2026-10-21/after-tablet-fr.png) |
| Mobile 390 × 844 | Mêmes gestes et effets tablette ; menu bas conservé | [EN](ux-menu-2026-10-21/after-mobile-en.png), [FR](ux-menu-2026-10-21/after-mobile-fr.png) |
| Les trois formats | Changer le thème → attribut HTML changé, menu fermé ; recharger → thème conservé ; Paramètres des agents → URL settings et menu fermé ; absence de débordement horizontal document | 12 tests au total, zéro retry |

Les captures desktop montrent le défaut avant et le focus visible après.
Les captures compactes sont des preuves de non-régression, pas des défauts
visuels prétendument corrigés. Les captures desktop FR, tablette EN et mobile FR
ont également été inspectées visuellement.

## Validation et version

- Base et `origin/main` vérifiés : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`.
- Empreintes SHA-256 des deux sources et de l'arbre complet du build servi :
  [version.json](ux-menu-2026-10-21/version.json). Le SHA du commit de livraison
  est celui de la tête de PR, à comparer avant intégration coordonnée.
- Builds de production locaux : réussis ; le dernier sert la correction finale.
- Playwright final : **12/12**. Navigation clavier et actions/persistance sont
  deux scénarios distincts, chacun conservant le budget de 30 s.
- 32 tests ciblés existants réussissent (PanelPrimitives, ConversationBranchesMenu,
  index documentaire). Ils complètent la recette réelle, sans la remplacer.
- ESLint des fichiers TS modifiés, lint applicatif, Prettier et `git diff --check` :
  réussis. Les hooks de commit imposent aussi le typecheck et le lint du dépôt.
- Typecheck complet : réussi après réinstallation conforme au lockfile des liens
  workspace manquants. Le premier TS2307 concernait auth/database/security dans
  le `node_modules` fourni ; aucun changement de dépendance ou de lockfile.

Les essais intermédiaires ne sont pas masqués : 0/6, puis 1/6, puis 10/12.
Ils ont révélé l'interception d'Escape, des attentes incorrectes sur les libellés
FR et l'URL canonique Agent, et le démontage de la coquille temporaire. Les
assertions comportementales restent présentes. La dernière recette synchronise
sur la transcription persistée et ne contient aucun sommeil ni interception réseau.

## Limites et dépendances

- Le menu ouvert **pendant** le remplacement de `PendingComposerShell` peut être
  perdu avec son en-tête. Dépendance à traiter avec le lot BaseChat/layout
  `01a15d1c-7861-7546-af99-7f0fb04670d8`, sans modification de ce périmètre ici.
- Copier/exporter/effacer la conversation ne sont pas exécutés : leurs commandes
  sont conservées et parcourues au clavier, mais leurs effets ne sont pas certifiés.
- Formulaires internes des paramètres, génération IA, runtime, publication,
  Safari/WebKit, lecteurs d'écran et production ne sont pas validés par ce lot.
- Le domaine de production et le téléchargement Playwright ont rendu des 403
  réseau. Aucun contournement ; Chromium système et pile locale employés.
- PR #746/#748 (API), #747 (signup/dashboard), Monaco et CI non modifiés.
  Seul l'index dérivé BUG_INVENTORY_LIVE peut nécessiter une régénération lors
  de l'intégration. Aucun ancien checkout ni commit `8edd7e4d` touché.

Ce lot ne certifie aucun panneau entier : 20 panneaux sur 31 restent sans recette
d'action documentée. Aucun doublon supprimé, aucun changement esthétique général.

## Complément de recette commune — 21 octobre 2026

[Recette commune avec #749, #753 et le patch de continuité fourni par l’éditeur](ux-common-2026-10-21/README.md). Le premier passage menu/dialogue donne 16/18 : deux mesures sont prises pendant la transition de réduction au toucher. Une assertion préalable de transform none est ajoutée, sans changer le seuil de 44 px, les budgets ni le produit. Le passage corrigé donne 18/18 ; Chromium standard 6/6 ; continuité menu/palette et chargement DB 10/10. La tête #750 est synchronisée avec main pour conserver les workflows et scripts PostgreSQL cohérents. Ces résultats ne constituent ni une fusion ni une certification de panneau complet.
