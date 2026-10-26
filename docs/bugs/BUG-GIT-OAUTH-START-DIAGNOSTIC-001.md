---
id: BUG-GIT-OAUTH-START-DIAGNOSTIC-001
section: "2026-10-26 — P0 connexion Git IDE"
---

## Bug

Sur Safari iPhone, le clic Connecter GitHub affiche « Impossible de lancer le flux OAuth GitHub. » avant sélection de dépôt. Capture rapportée par le parent ; le statut HTTP de cette tentative n'est pas disponible dans cet environnement.

## 📤 Dispatché

26 octobre : diagnostic Git dédié, distinct du hub Intégrations et de la recette navigateur menée par une autre session.

## 💻 Codé

Non livré sur main. Lot diagnostic sur `fix/git-repository-errors-20261026`, base `951ceb8d5653bee4df30b010753c859c0c4a44c0`, destiné à une PR brouillon. Aucun changement de configuration, permission, secret ou app.ts.

## ✅ Testé live

Non validé en production ou sur Safari matériel. Tests locaux uniquement ; le blocage utilisateur n'est pas déclaré résolu.

## Diagnostic vérifié

Le POST BFF `/api/integrations/oauth/:provider/connect` existe et appelle le même chemin API. Le backend exige une session puis `projects:write` si un projet est fourni. `connectorCredentialsFor` consulte le catalogue existant puis les variables de configuration ; un catalogue désactivé ou une configuration absente peut produire `503 PROVIDER_NOT_CONFIGURED`. Ce cas est reproduit par la suite API locale, pas constaté en production.

Le BFF effaçait ce code en `OAUTH_START_FAILED`, puis le panneau utilisait la même phrase pour tous les statuts. Un test rouge confirme cette perte. Le correctif conserve uniquement le diagnostic reconnu de configuration indisponible, avec copie publique localisée, et distingue côté panneau 401/403/429. Aucun détail serveur brut n'est rendu. Les restrictions de session et de projet sont inchangées. La configuration réelle reste à vérifier au moyen du statut/code de la requête échouée, sans lire de secret.

Le sélecteur de dépôts, chemin distinct et postérieur, appelle `/api/github-stats`. Deux tests rouges prouvent que ses erreurs 403/429 devenaient 503. Le correctif conserve ces statuts et Retry-After pour 429, avec copie publique ; aucun nouvel accès GitHub.

## Validation locale

42 tests web/BFF/index dans six fichiers et 10 tests API OAuth passent. Les réponses fournisseur sont simulées dans ces tests : aucun grant ni compte fournisseur créé. Tests rouge/vert du BFF documentés ci-dessus. Build client/SSR, gate officiel complet `node scripts/typecheck.mjs`, lint global (0 erreur, 52 avertissements), formatage et `git diff --check` réussis. Revue indépendante favorable après correction du message de session pour GitLab et ajout d'un test.

Le premier gate officiel a échoué sur quatre TS2307 : `scripts/qa/database-restore-api-fixture.ts:8` (`@vibecore/database`), `database-restore-physical.ts:12` (`@vibecore/auth`), `:13` (`@vibecore/database`), `:14` (`@vibecore/security`). Les mêmes diagnostics ont été reproduits sur la base. Les liens locaux manquants vers ces paquets déjà présents ont été rétablis, sans changement suivi, puis toutes les étapes officielles ont passé : web, scripts, helpers IDE, Electron et paquets workspace/API. pnpm 9.14.4 correspondant au packageManager du dépôt a été utilisé.

Une commande exploratoire directe `tsc -p tsconfig.json`, différente du gate officiel découpé, a produit de nombreux diagnostics de tests. La comparaison exhaustive avec la base n'est pas revendiquée : un essai base avec liens de dépendances a dépassé la mémoire Node. La première invocation de l'index via node --test était incorrecte (test Vitest), reprise avec Vitest réussie. Aucun garde affaibli, aucune recette Safari/production annoncée. Le scan gitleaks local est indisponible ; la CI sécurité reste requise avant livraison.

Comparaison indépendante de cette commande exploratoire : 864 diagnostics initiaux, 1 413 sur la première exécution base (dépendances supplémentaires absentes) ; 862 diagnostics complets identiques après normalisation des positions et racines absolues. Parmi eux : `GitProviderConnectPanel.spec.tsx:222` sur base, TS2493/TS2339 (mock à un argument lu avec deux arguments) ; `SettingsSurfacesI18n.spec.tsx:14`, TS2769 ; `:52–53`, TS2322 ; `SettingsCore.i18n.spec.tsx:268`, TS2786. Deux diagnostics ne sont pas reproduits intégralement : `services/workspace-manager/src/app.spec.ts:59`, TS2420, et `nix-placement.spec.ts:84`, TS2416. Aucun de ces fichiers produit/services n'a été modifié par ce lot ; l'identité totale des environnements n'est pas revendiquée.

## Lacunes distinctes à coordonner

La connexion UserConnection qui sert à lister les dépôts n'est pas injectée dans GitCliProvider pour clone/pull/push. L'action configure-remote ne fait qu'ajouter origin, sans fetch ni vérification fournisseur. L'import copie des fichiers sans historique Git. Ces constats ne sont pas attribués à l'échec de lancement OAuth visible sur la capture.

Une preuve Git locale réelle sur fichiers synthétiques confirme que listFiles/writeFiles recrée un dépôt main sans commit ni origin ; configureRemote ajoute seulement origin. Le transport clone et la route import complète ne sont pas exercés. Un futur raccordement de credentials nécessite coordination app.ts et confirmation séparée pour le changement d'accès ; aucune implémentation de ce raccordement dans ce lot.
