# Navigation, fermeture et identité des onglets — 22 octobre 2026

Cette recette complète les 68 cas historiques de d558b448. Sa CI verte ne couvrait pas la navigation interrompue : une contre-épreuve a démontré une sélection incorrecte après Retour. Aucun merge de cette tête n’a été effectué.

## Corrections et rouges conservés

- `69592374` : le reçu anti-écho porte l’identifiant de la navigation réellement appliquée. Une demande redondante sans navigation active l’efface ; un second déplacement pendant la même navigation réutilise son identifiant et actualise la destination. Les rouges interruption et double déplacement restent dans [navigation-echo](../navigation-echo/README.md).
- `d0ef2126` : désactivation de l’alignement magnétique de la bande d’onglets à partir de 1024 px. Le défilement entre appui et relâchement détournait le clic de fermeture vers la bande. Le défilement doux et le menu mobile sont conservés. Les expériences CSS de diagnostic sont distinctes du build final et documentées dans [tab-strip-snap](../navigation-echo/tab-strip-snap/README.md).
- Le test désépingle par le menu visible : le petit bouton d’épinglage est intentionnellement masqué sur un onglet épinglé. L’échec initial de ce geste de préparation reste distinct du clic effectivement perdu ensuite.

## Provenance

Build produit `d0ef212609d3af7f652cc216427ecb7a55570723`, arbre `70a9559941e7ed8ce590f459bf8430b6bffbdf55`, base main `18cf74fd7abcd59620f0994b44ac1411e97fcf93`. Les 9 308 sources suivies ont été comparées aux blobs Git avant compilation. Les modifications suivantes concernent uniquement documentation et index ; la comparaison de publication doit le confirmer.

Le manifeste `compiled.json` contient 2 306 fichiers, vérifiés depuis l’archive locale SHA-256 `f97b31e62435ae66ac41f94fe38dbf9e32411ee67e99978e99fdcd0652f6eb00`. L’archive n’est pas publiée. `/login` répond 200 sur le serveur local 5220 et un JavaScript servi correspond octet pour octet au build (`served-asset.json`). Aucun build n’est modifié pendant les recettes.

## Résultats

**73/73 succès directs, zéro retry, zéro omission** : 7 RPL/navigation, 45 IDE, 3 fichiers/docking/B→A, 6 confirmations EN/FR et 12 menus EN/FR. `actions.json` donne chaque cas et sa durée. Les 35 tests unitaires passent. Les hooks du commit produit ont validé typage, lint et Gitleaks.

## Reproduction

Node 24.19.0, pnpm 9.14.4, Chromium système, API compilée locale 3017, PostgreSQL local dédié et sessions synthétiques isolées avec quotas normaux. Aucun compte utilisateur réel ou credential fournisseur. Les configurations locales exactes sont jointes en fichiers `*.config.ts.txt` ; les confirmations et menus emploient `playwright.combined-ux-audit.config.ts` du dépôt. La copie locale RPL ne change que `OUT_DIR`.

Les deux scénarios de navigation suspendent la continuation d’une vraie requête React Router jusqu’au geste suivant, sans réponse simulée et sans délai fixe. Le premier exige un échec réseau réellement observé avant Retour/Avance ; le second libère la requête après deux déplacements et vérifie les mêmes identifiants et le même nombre d’onglets. Les délais et assertions existants ne sont pas assouplis.

Une première invocation du pnpm système a échoué avant compilation sur son chemin de cache. La commande avec pnpm 9.14.4, version du dépôt, a ensuite réussi ; aucun changement de permissions, de dépendances ni dispense.

## Limites

La disparition de palette globale pendant préparation reste un défaut ouvert distinct, sans cause de remontage prouvée : [fiche](../../../BUG-IDE-GLOBAL-PALETTE-HANDOFF-001.md). Les nouveaux tests de navigation utilisent directement le bouton Déploiements ; les deux anciens scénarios RPL conservent leur parcours palette. Les rouges de palette ne sont pas présentés comme corrigés.

Les tests de documents flottants interceptent runtime/sauvegardes et ne certifient pas une persistance distante. Les succès B→A n’expliquent pas son intermittence historique. Aucune exécution terminal, fournisseur IA, certification complète de panneau ou réparation du projet réel de l’utilisateur n’est revendiquée. Les résultats locaux ne remplacent pas la CI et la revue de la tête publiée.
