# Correctif local en préparation

Worktree /workspace/vibecore-ui-semantics-next, branche fix/public-semantic-navigation-20261026, base ad80c14a5. Contrôle frais GitHub :32PR ouvertes, pagination exhaustive fichiers, aucun chevauchement des4composants (open-pr-files.json). Aucun sharedUi, moteur IDE, catalogue ou destination modifié.

Source :12paires Button asChild > Link conservent variantes, classes, textes, icônes, href et testids ; main autour contenu PublicTeamPage/PublicDeploymentsPage, hors navbar/footer, avec sections différées incluses. Prettier réindente les2pages, volume réel réduit visible via git diff --ignore-all-space. Aucun nouveau contenu produit ou service.

Tests : nouveau public-navigation.spec.tsx (DOM jsdom + vrai MemoryRouter/Link/Button, shell navbar/footer isolé seulement), FR/EN3pages, attend4liens dont sections lazy, destinations ordonnées, absenceimbrication,1main/1h1 et liens dedans, nav/footer dehors.6rouges avant (4paires/page),6verts après ;21tests existants agreement-team et partners-info verts,27total3fichiers. La cible public-deployments.spec.ts passée initialement n'existe pas et n'a pas été exécutée. Le vrai clavier reste une recette Chromium distincte, pas attribué à jsdom.

Lint initial2erreurs d'espacement dans nouveau test, corrigées ; lint final0 et Prettier5fichiers0. Aucun build/tsc effectué ici ; revueindépendante avant build demandée public_ui_audit. Réception compilée après et validation de l'effet flex/main restent requises.

Baseline géométrique ciblée en cours ; premier lancement avant prêtserveur refusconnexion, conservé before/startup-race.json et geometry-before.txt. HTTP200 vérifié avant reprise, pas défautproduit.
