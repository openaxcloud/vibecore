# Compte : navigation visible sur écran étroit

Base main `a18c7defb`. Le delta produit touche `app/routes/account-settings.tsx` et `app/routes/billing.tsx` ; le shell partagé et le menu bas sont conservés. Captures avant/après locales Chromium avec API synthétique, jamais une recette de production.

## Reproduction et correction

À 320px FR : bande292px, contenu424px, dernier lien jusqu'à437,906px. Voir `before-320-fr.png`. La navigation revient désormais à la ligne et expose ses liens natifs avec `aria-current`. Voir `after-320-fr.png`, `after-820-fr.png`, `after-1440-fr.png`.

## Matrice de couverture

| Page/panneau | Tailles | Couverture |
| --- | --- | --- |
| Compte/profil et navigation locale | 320×740,360×800,390×844,844×390,768×1024,820×1180,1024×768,1280×800,1440×900,1920×1080,2560×1440 | FR/EN × clair/sombre : 44 observations ; liens contenus, hauteur≥44px, route active, saisie longue conservée à chaque redimensionnement |
| Compte/dialogue modifications non enregistrées | 640×400 | 4 observations FR/EN clair/sombre : navigation clavier vers Données interrompue, dialogue, Échap, brouillon conservé ; Tab nom→email ; fuseau invalide annoncé |
| Zoom200% | 640×400 (équivalent de1280×800 divisé par2) | Mise en page seulement ; zoom natif navigateur non mesuré |
| Compte connecté / Données | — | Destinations présentes ; sous-pages non recettées |
| Dashboard / Facturation / autres panneaux | — | Non recettés par ce script |
| Deploy/Git/Publish/Domains, intégrations métier, Debugger | — | Périmètres concurrents exclus ; aucune validation globale revendiquée |
| Safari/iOS réel, clavier virtuel, safe areas physiques | — | Non testé |
| Retour historique, focus après Échap, contrastes chiffrés | — | Non testé par ce lot |

Le contrôle de débordement porte sur la navigation, pas sur chaque élément de toute la plateforme. Le texte long est une valeur de champ, pas une traduction artificiellement rallongée des libellés. `receipt.json` conserve les mesures détaillées. Aucun achat, abonnement, DNS ni publication.

## Rejouer localement

Depuis la racine du dépôt, avec dépendances installées :

```sh
node docs/bugs/account-navigation-2026-10-25/fixture.cjs
SAAS_API_URL=http://127.0.0.1:3099 VITE_DEV_HOST=127.0.0.1 VITE_DEV_PORT=5199 VITE_STRICT_PORT=true pnpm dev:web
node docs/bugs/account-navigation-2026-10-25/check.cjs
```

Le script accepte `UI_BASE_URL` local et `CHROMIUM_PATH`. La fixture n'est jamais importée par le produit. Toutes mutations retournent503 ; aucun compte réel utilisé. Les requêtes tierces du navigateur sont bloquées.

## Validation

11 tests ciblés verts (profil, fuseau, navigation i18n). Revue indépendante favorable, test navigation2/2 également exécuté indépendamment. Build, lint et typage : résultats finaux consignés dans la PR. La réussite locale ne vaut ni CI complète ni déploiement.

## Second défaut : annonce de confirmation Facturation

`billing.tsx` affichait le résultat positif d'une action sans région live. Ajout de `role="status"` et `aria-live="polite"`, sans changer traitement, montant ni autorisations. Le test `billing.feedback.spec.tsx` soumet le formulaire réel via un routeur mémoire avec action synthétique : succès annoncé, erreur séparée, absence de faux succès avant résultat. Les trois suites Facturation passent (15 tests). Cette preuve DOM n'est ni une mesure de synthèse vocale ni une recette visuelle Facturation.

La recette Compte a également été rejouée sur le build compilé (port 5399) : 48 observations vertes. Le reçu final identifie sa baseURL.

## Cartographie de départ et parcours à poursuivre

Inventaire de sources, pas une preuve de fonctionnement : `workspaceNav`, `orgNav`, `accountNav` et `USER_AREA_ROUTE_PREFIXES` dans SaaSLayout ; registre canonique `app/lib/ide/panel-registry.ts`.

| Surface | Parcours essentiel | État de cette session |
| --- | --- | --- |
| Dashboard, projets, modèles, palette | Trouver/créer/rouvrir un projet | Sources cartographiées ; non recetté |
| Compte/profil | Lire, modifier, valider, conserver un brouillon lors d'un changement de taille, quitter sans perdre involontairement | Recette synthétique partielle détaillée ci-dessus |
| Compte connecté, confidentialité, sécurité, sessions, récupération, clés API, notifications | Comprendre statut et portée, confirmer les opérations sensibles, récupérer une erreur | Sources cartographiées ; sous-pages non recettées |
| Facturation, usage, factures, paiement | Comprendre crédits/coûts/plafonds et résultat de soumission | Annonce de résultat corrigée/testée DOM ; écran et opérations réelles non recettés |
| Équipe, rôles, SSO/SCIM, support, workspace/desktop settings | Trouver les réglages, expliquer permissions et erreurs | Sources cartographiées ; non recetté |
| IDE agent/editor/preview/files/search/locks | Éditer, rechercher, prévisualiser ; conserver saisie et focus lors des redimensionnements/panneaux | Non recetté ; shell commun réservé |
| IDE overview/studio/problems/database/object-storage/packages/skills/monitoring/ports/extensions/workflows/security/env/secrets/activity/terminal/logs/collaborators/snapshots/settings | Trouver action principale, rendre chargement/statut/erreur réels, accéder au bas du panneau | Registre cartographié ; non recetté |
| IDE git/deployments/domains, integrations, debugger | Parcours appartenant aux sessions parallèles | Exclus des corrections de cette session |
| Marketing/authentification | Entrée, inscription/connexion, orientation vers produit | Non recetté |

Prochains lots concrets : recette écran Facturation (sans paiement) ; profil erreur503/reprise ; sous-pages Compte ; dashboard/projets ; panneaux IDE non possédés. Vérifier toutes les tailles ci-dessus sur chaque lot, puis Safari/clavier virtuel/safe areas, zoom natif200%, focus restauré/Retour et contraste chiffré. Ne cocher aucun de ces restes avant preuve.

Revue finale indépendante : favorable après correction de la région live, désormais toujours montée vide avant réponse. Test renforcé : identité du même nœud avant soumission, après succès, puis après erreur qui le vide. Le réviseur a exécuté indépendamment les 4 tests navigation/feedback. Lint global final : 0 erreur, 52 avertissements préexistants. Suite ciblée avec inventaire : 32 tests verts.

Installation locale : le worktree réutilise les dépendances déjà installées, avec liens workspace isolés vers ses propres packages. Les premiers essais de typage global ont révélé des dépendances racine absentes puis deux identités Prisma issues de copies différentes ; liens corrigés sans changer les sources ni les exigences de validation.

Build final vert ; recette compilée finale sur port5399 : 48 observations vertes. Typage web, scripts Node, helpers navigateur IDE et Electron main/preload verts. Le binaire pnpm11 global a échoué avant les packages (tentative automatique d’installation dans un HOME absent) ; contrôle packages relancé avec pnpm9.14.4 épinglé par le dépôt via Corepack local. Aucun changement de package.json, lockfile ou pipeline.
