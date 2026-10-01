---
id: BUG-QA1001-CONNECTE-REVOIT-LA-CONNEXION
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Deuxième visite — un client déjà connecté qui clique « Se connecter » sur e-code.ai se voit redemander
son mot de passe.**

Mesuré le 2026-10-01 vers 08:00 en local, vraie API. Session valide (contrôle positif : `/dashboard`
s'ouvre, 200, liens du tableau de bord présents). Puis :

| Adresse ouverte | Résultat |
| --- | --- |
| `/login` | 200, reste sur `/login`, 1 champ de mot de passe |
| `/register` | 200, reste sur `/register`, 2 champs de mot de passe — il peut ouvrir un second compte par erreur |
| `/login?returnTo=%2Fprojects` | 200, formulaire |

Sur e-code.ai, « Se connecter » mène (301) à `app.e-code.ai/login`, où le cookie de session est bien
envoyé : la page avait de quoi savoir que le client est connecté.

Gravité : pas bloquant (il retape son mot de passe et passe), mais c'est l'accueil de CHAQUE retour d'un
client par la page d'accueil.

## Cause

Les loaders de `app/routes/login.tsx` et `app/routes/signup.tsx` ne consultaient jamais la session.

## 📤

☑ 01/10 PR

## 💻

☐

## ✅

☐

## Preuve

Visite délibérée (aucun paramètre hors `lang`) + session confirmée par l'API (`/auth/me`) → `/dashboard`.
Tout le reste garde le formulaire, volontairement :

- `returnTo` : trace d'un 401 ; renvoyer vers la destination pourrait boucler ;
- `oauth` / `error` : l'échec d'un compte social reste lisible, même pour un client connecté ;
- jeton refusé par l'API : formulaire, sans boucle ; sans cookie : formulaire, sans appel réseau.

Épinglé par `app/routes/session-ouverte-evite-la-connexion.spec.ts` (vraies routes contre un vrai serveur
HTTP, 7 cas). Rouge avant (aucune redirection), vert après. Contre-épreuve : garde sur les paramètres
retirée → les témoins `returnTo` et OAuth rougissent. Parcours réel :
`tests/e2e/session-ouverte-evite-la-connexion.spec.ts` (Chromium) — rouge sans correctif, vert avec.
