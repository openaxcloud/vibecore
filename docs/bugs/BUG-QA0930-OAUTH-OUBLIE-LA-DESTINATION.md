---
id: BUG-QA0930-OAUTH-OUBLIE-LA-DESTINATION
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (inscription) — s'inscrire ou se connecter avec Google / GitHub renvoie TOUJOURS au tableau
de bord : la destination du visiteur est perdue.**

Même classe que BUG-QA0928-IDEE-PERDUE-INSCRIPTION, par l'autre entrée de l'inscription. Relevé le
2026-09-30 en production (WebKit iPhone, sans compte) : sur `/register?returnTo=%2Fprojects%2Fnew` et
`/login?returnTo=%2Fprojects%2Fnew`, les boutons pointent vers `/auth/oauth/github` et
`/auth/oauth/google` — sans `returnTo`. Le démarrage (302 vers le fournisseur, vérifié) ne lit aucune
destination, et le retour fait `redirect('/dashboard')` sans condition
(`app/routes/auth.oauth.$provider.callback.tsx`).

Conséquence : le visiteur qui a tapé son idée sur l'accueil, puis choisit « S'inscrire avec Google », arrive
au tableau de bord vide ; son idée n'est pas posée dans le composeur.

## Repro

Production, sans compte : relevé des `href` des boutons fournisseurs sur les deux pages ci-dessus ;
`curl -D - --max-redirs 0 https://app.e-code.ai/auth/oauth/google?returnTo=%2Fprojects%2Fnew` → aucun cookie
ne porte la destination (seuls `vc_oauth_state` et `vc_oauth_link`).

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Aucun test — point OUVERT.
