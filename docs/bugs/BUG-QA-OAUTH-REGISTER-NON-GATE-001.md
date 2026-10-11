---
id: BUG-QA-OAUTH-REGISTER-NON-GATE-001
---

## Bug

**`/register` propose « S'inscrire avec GitHub » et « S'inscrire avec Google » alors que ces fournisseurs ne sont pas configurés — le clic éjecte l'utilisateur vers la page de CONNEXION avec une erreur.** Parcours reproduit de bout en bout : bouton « S'inscrire avec Google » sur `/register` → **`302` vers `/login?oauth=google&error=not_configured`**. Un visiteur qui veut **créer** un compte se retrouve donc sur la page de **connexion**, porteur d'une erreur, sans avoir rien créé. Double peine : l'action n'aboutit pas, et la redirection change de page. **Asymétrie de garde entre les deux pages, lue sur `origin/main`** : `/login` interroge `/auth/oauth/providers` dans son loader (`login.tsx:158`) et n'affiche un bouton que si `ready !== false` (`:289`) — sur cet environnement l'endpoint rend `{"providers":[{"provider":"github","ready":false},{"provider":"google","ready":false}]}`, et `/login` masque donc correctement les deux boutons. **`register.tsx` n'a aucun `loader`** : il ne peut pas connaître la disponibilité et rend les deux boutons **inconditionnellement**. Le composant partagé `AuthOauthButton` (`app/components/auth/AuthScreen.tsx:356`) n'expose pas de notion de disponibilité — le filtrage est laissé à l'appelant, et un seul des deux appelants le fait. **Constat live** : `/login` → 9 contrôles visibles, **aucun OAuth** ; `/register` → 12 contrôles, dont **« S'inscrire avec GitHub » et « S'inscrire avec Google »**. ⚠️ **Fausse piste écartée en cours d'analyse** : le commentaire de `login.tsx:151-154` annonce un repli « *never hide on an API hiccup* » alors que le `catch` fait `providers = []`. J'ai cru à un fail-closed contredisant le commentaire — c'est faux : ligne 289, `find(...)?.ready !== false` vaut **`true`** pour un tableau vide (`undefined !== false`), donc les boutons **s'affichent bien** en cas de panne. Le repli est conforme à son commentaire. **Correctif** : donner à `register.tsx` le même `loader` que `login.tsx` (appel `/auth/oauth/providers`) et appliquer la même condition, ou faire porter la disponibilité par `AuthOauthButton` pour que les deux appelants ne puissent plus diverger. Accessoirement, faire retomber l'erreur OAuth sur `/register` quand le parcours a démarré là.

## 📤

☐

## 💻

☐

## ✅

✅ **28/08** reproduit live en 390 px, redirection tracée

## Preuve

Capture : `docs/audit/evidence-2026-08-27/register-390-oauth.png`. Journal : `/tmp/qa-sweep/mob/portes.log`. ⚠️ **Réserve d'environnement** : sur cet environnement de test, **aucune** application OAuth n'est configurée (runbook §5). Le défaut démontré est donc l'**absence de garde** sur `/register`, comparée à la garde présente sur `/login` — ce qui est un écart de code, indépendant de l'environnement. En **production**, où les fournisseurs sont configurés, l'effet visible serait nul tant que rien n'est désactivé ; il réapparaîtrait dès qu'un fournisseur tombe ou est désactivé par un administrateur.

