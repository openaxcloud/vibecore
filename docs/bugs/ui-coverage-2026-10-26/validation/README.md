# Validation du lot UI et défilement

Base intégrée : `ea2ff01c5cf6ffc5116f6ae98e9aaa4a43a807af` (#796). Son arbre est identique à la tête `1714415cb` sur laquelle les travaux ont commencé ; le fast-forward n'a changé aucun fichier. Le nouveau lot contient huit fichiers produit et un test E2E ajouté à une suite existante. Les six anciennes fiches #795/#796 sont mises à jour uniquement pour refléter leur fusion vérifiée ; leur recette UI production reste décochée.

## Vérifications

- 222 tests Vitest distincts dans 17 fichiers : 37 Organisation/SaaSLayout, 100 publics/Docs et 85 gardes de styles. Les 31 tests rejoués après le delta header et les deux tests AgentWalkthrough répétés ne sont pas additionnés. Ce total réunit des validations ciblées successives, pas une invocation unique de la suite entière sur la tête finale.
- Le nouveau test E2E de défilement échoue sur l'ancien build puis passe sur le fichier final, sans retry, avec molette et PageDown. [Commandes, configurations et reçus](../scroll-regression/README.md).
- Build final et typage web strict réussis. Lint global : zéro erreur, 52 avertissements existants ; lint ciblé du delta Docs ultérieur réussi. Les huit fichiers TS/TSX/test modifiés passent Prettier. Le fichier SCSS présente deux écarts de formatage préexistants, reproduits sur le contenu exact de main avec le même chemin de configuration ; les deux sélecteurs modifiés n'en introduisent pas. [Détail](formatting-note.txt).
- Gitleaks 8.21.2 complet sur le contenu final : aucune fuite, configuration inchangée et aucune nouvelle exception. [Journal final](gitleaks-final.txt).
- Index régénéré à 504 fiches ; garde de six tests réussie. Aucun statut de recette UI production attribué à partir d'un test local ou d'un rollout.
- [Revue indépendante finale](final-review.md), [résultats publics transcrits des outils](public-tests-summary.json), [empreintes des neuf fichiers source/test](final-source-sha256.json).

## Recettes compilées

La [matrice courante](../current-routes.md) distingue les reçus historiques et les nouvelles phases. Organisation 10599 : 48 observations et huit groupes, puis contrôles focus/tableau. Public 10899 : 88 observations, huit groupes et quatre zooms natifs à 200 %. Header 10999 : huit simulations safe-area, 32 cas sans inset et 16 fermetures/focus. Après les deux derniers deltas SSR/CSS, build 11099 : Docs 16 chargements froids et 16 Retours, deux zooms à 200 % ; quatre groupes Account Inactivity avec scroll/menu/Retour ; Security/Switcher et vrai IDE synthétique vérifiés pour le scroll, le focus et le maintien du menu bas IDE. Ces groupes ne s'additionnent pas en nombre de pages certifiées.

Toutes ces recettes sont locales, sous Chromium, avec données synthétiques. Aucune action financière, invitation, accès ou publication cliente réelle. La simulation des insets et du redimensionnement pendant saisie ne constitue pas un test iOS physique ou de clavier virtuel OS.

## Limites conservées

Security paysage empiète encore de 4 px sur l'inset latéral simulé. Le focus mailto de la page Inactivité peut rester hors vue après resize. AppShell n'a pas le menu bas présent dans BaseChat ; la demande globale reste ouverte. L'erreur synthétique Templates « Unavailable » et sa langue restent un défaut séparé ; aucun moteur partagé ni opération #764/#768 n'est retenté. Les inventaires de routes/panneaux ne certifient pas tous les états, navigateurs ou parcours de la plateforme.

Les copies archivées de propositions `.patch` et journaux texte ont leurs espaces de fin de ligne et fins CRLF normalisés pour le contrôle Git. Ce sont des diagnostics ; les scripts, mesures, captures et empreintes des sources produit restent distincts. Les originaux de session restent dans `/tmp`.
