---
id: BUG-QA0928-IDEE-PERDUE-INSCRIPTION
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**BLOQUANT — l'inconnu qui décrit son app sur l'accueil puis s'inscrit arrive sur un tableau de bord vide ; son idée ressurgit plus tard et se lance toute seule.**

Parcours 1, tel qu'un nouveau visiteur le vit :

1. Accueil → il tape son idée → « Créer maintenant » → « Créer l'application complète ».
2. Il est envoyé sur **`/login?returnTo=/projects/new`** — une page « Ravi de vous revoir » alors
   qu'il n'a pas de compte.
3. Il clique « Inscrivez-vous gratuitement » → **`/register` sans `returnTo` ni `prompt`**.
4. Après l'inscription : **`/dashboard`**. Son idée n'apparaît nulle part.
5. Elle dort dans `sessionStorage` (`pendingAppDescription` + `composerBuildIntent=1`). Le jour où il
   clique « Nouveau projet » dans le même onglet, **elle est soumise automatiquement** et crée un
   projet qu'il n'a pas redemandé (crédit consommé).

## Cause (lue dans le code, `5cd5e6db7`)

- `app/routes/login.tsx:386` — `<Link to="/register">` ne propage pas `returnTo`.
- `app/routes/signup.tsx:89` `postRegisterDestination` — ne connaît que `?prompt=` ; sans lui,
  `/dashboard`.
- `app/routes/projects.new.tsx:773` — seul consommateur de `pendingAppDescription`, et il soumet
  sans confirmation.

## Repro

### Production (sans compte) — étapes 1 à 3, OBSERVÉ

```sh
node docs/bugs/qa-2026-09-28/repro-anon-handoff.mjs
```

WebKit iPhone 13 et Chromium 1440 : `url = /login?returnTo=%2Fprojects%2Fnew`, titre « Ravi de vous
revoir » / « Welcome back », `sessionKeys = [pendingBuildMode, pendingAppDescription,
composerBuildIntent]`. Lien d'inscription relevé sur cette page : `Inscrivez-vous gratuitement ->
/register`. Artefacts : `artefacts/handoff-webkit-390-*.png`, `artefacts/handoff-chromium-1440-*.png`,
`artefacts/login-from-handoff-webkit-390.png`.

L'inscription elle-même n'a PAS été faite en production (création de compte interdite à cette
session).

### Local (build de prod, compte de test sur 127.0.0.1) — étapes 1 à 5, REPRODUIT

```sh
node docs/bugs/qa-2026-09-28/repro-handoff-register.mjs      # Chromium 390, locale fr-FR
```

```
"etape1_apresClic": "/login?returnTo=%2Fprojects%2Fnew",
"etape2_lienInscription": "/register",
"etape3_apresInscription": "/dashboard",
"ideeEncoreEnSessionStorage": {"idee": "QA-IDEE-5521 un carnet de recettes avec recherche", "intent": "1"},
"ideeAfficheeApresInscription": false,
"etape4_nouveauProjetPlusTard": "/@org-…/qa-idee-5521-un-carnet-de-recettes"   ← projet créé tout seul
```

Artefacts : `artefacts/handoff-local-register-rempli.png`, `artefacts/handoff-local-apres-inscription.png`.

Note : sous WebKit en local, l'inscription renvoie à `/login` — artefact de l'environnement (cookie
`Secure` refusé sur `http://127.0.0.1`), pas un défaut de prod ; la repro par défaut utilise Chromium.

## Correctif suggéré

Envoyer l'inconnu vers **l'inscription** (pas la connexion) quand il vient de l'accueil, propager
`returnTo` entre `/login` et `/register`, et faire consommer l'idée par la destination
post-inscription — ou, à défaut, la montrer sur le tableau de bord (« Reprendre : … ») au lieu de la
lancer sans prévenir.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Repro prod (étapes 1–3) + repro locale (1–5) ci-dessus. Aucun test ne l'épingle — point OUVERT.
