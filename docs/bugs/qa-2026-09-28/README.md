# Balayage QA avant lancement — 2026-09-28

## Environnement consigné (règle 11)

- Code : `5cd5e6db7` (origin/main), worktree détaché, arbre propre hors `docs/bugs/`,
  `pnpm install --frozen-lockfile`.
- Production : `web` servie = tag `5cd5e6db75` (digest `sha256:5a1bc8c8…`), relevé à 16:14 UTC.
  Journaux `api` lus sur 11:14 → 17:18 UTC.
- Local : build de production (`VITE_RUNTIME_MODE=remote-kubernetes`,
  `VITE_RUNTIME_API_BASE_URL=http://127.0.0.1:3011/api/runtime`) servi par `node server.mjs`
  (127.0.0.1:5183) ; API `pnpm run dev:api` (127.0.0.1:3011, `API_CORS_ORIGINS` avec l'origine
  locale) ; Postgres/Redis/Mailpit : `docker compose -p vc-qa0928 -f docker-compose.dev.yml`
  (ports 55532 / 56479 / 51125). **Pas de workspace-manager** : tout ce qui dépend d'un pod
  (fichiers vivants, terminal, aperçu) n'est pas jugeable en local.
- Moteurs : WebKit (profil iPhone 13) et Chromium, Playwright `@playwright/test` du dépôt.

## Limite de méthode

Aucun compte n'a été créé en production et aucun mot de passe n'y a été saisi : les parcours
authentifiés ont été exercés sur la pile locale, avec des comptes de test `@example.test`. En
production, seuls les parcours anonymes et les journaux (lecture seule) ont été exploités.

## Défauts

| Gravité | Fiche | Où c'est prouvé |
|---|---|---|
| Bloquant | [BUG-QA0928-RUNTIME-ID-PROJET](../BUG-QA0928-RUNTIME-ID-PROJET.md) | prod (journaux) + local |
| Bloquant | [BUG-QA0928-IDEE-PERDUE-INSCRIPTION](../BUG-QA0928-IDEE-PERDUE-INSCRIPTION.md) | prod (étapes 1–3) + local (1–5) |
| Gênant | [BUG-QA0928-PROMPT-TRONQUE](../BUG-QA0928-PROMPT-TRONQUE.md) | prod (accueil) + local |
| Gênant | [BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE](../BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE.md) | local |
| Gênant | [BUG-QA0928-PALETTE-RESTE-OUVERTE](../BUG-QA0928-PALETTE-RESTE-OUVERTE.md) | local |
| Gênant (a11y) | [BUG-QA0928-MODALE-SANS-FOCUS](../BUG-QA0928-MODALE-SANS-FOCUS.md) | prod |
| Gênant (équipe) | [BUG-QA0928-DEV-WEB-ESBUILD](../BUG-QA0928-DEV-WEB-ESBUILD.md) | local |
| Cosmétique | [BUG-QA0928-COSMETIQUES](../BUG-QA0928-COSMETIQUES.md) | prod + local |

## Écartés après mesure (NON-DÉFAUTS)

- Pages publiques : 144 rendus (4 formats × 2 hôtes × 18 chemins), aucun débordement horizontal,
  redirections `/projects` et `/dashboard` → `/login?returnTo=…` correctes, 404 localisée
  (`sweep-public.mjs`, `artefacts/public-report.json`). Reste du bruit : `401` sur
  `/api/configured-providers` depuis les pages 404 anonymes.
- Menu mobile de l'accueil : il défile jusqu'au dernier lien (« Accessibilité ») sur WebKit.
- `POST /xmlrpc.php`, `/pricing`, `/blog` : `405`, pas de 500.
- `/deployments` connecté affiche la page marketing : voulu, les déploiements vivent sous
  `/projects/:id/deployments`.
- Sauvegarde d'un fichier avec runtime indisponible : message honnête (« The file could not be
  saved… »), marqueur « non enregistré » conservé.
- États vides d'un compte neuf (`/dashboard`, `/projects`, 390 et 1440) : « Aucun projet pour le
  moment » + appels à créer, aucune erreur (`repro-etats-vides.mjs`).
- « Aucun `load` en 30 s » sur WebKit : dû à ma machine saturée par un build ; rejoué ensuite, OK.

## Non couvert — à faire avec un compte de production

- Génération réelle de bout en bout et aperçu qui tourne (runtime GKE).
- Panneaux dépendant du pod : terminal (hors onglet mobile gelé), fichiers vivants, aperçu.
- Deux onglets sur le même projet : la sauvegarde passe par le runtime, donc non jugeable en local.
- Rechargement en pleine génération, projet volumineux, crédits IA épuisés.
- Tout ce qui touche les sujets confiés à d'autres sessions (relance instruite, raisonnement, sauts
  de défilement, délai d'aperçu, repli entre fournisseurs, propositions ouvertes).
