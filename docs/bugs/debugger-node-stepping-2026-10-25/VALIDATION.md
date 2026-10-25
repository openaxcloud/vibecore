# Validation — moteur Node pas-à-pas

Base : main `941d7d7fc74e2e4f5fa37bbe59d1900f8061adf6`. Environnement distant isolé, Node 24.19.0 et pnpm 9.14.4. Aucun accès Railway, ordinateur utilisateur ou données réelles.

## Distinction des preuves

Les tests workspace-agent lancent de vrais processus Node avec des fichiers temporaires synthétiques et le protocole Inspector privé. Les appels agent utilisent Fastify inject ; ils ne prouvent pas un parcours Kubernetes/production. Les tests API/BFF exécutent les handlers avec autorisations, stockage ou transport contrôlés. Les tests UI rendent la déclaration React réelle extraite du panneau avec composants feuilles et données contrôlés sous jsdom : ce ne sont pas des tests navigateur ni des mesures responsive.

Aucun résultat historique #779/#780 n'est transféré à ce nouveau moteur. Aucune vérification du SHA servi, recette production, Safari ou appareil physique n'a été effectuée. Aucune configuration de sécurité/protection/déploiement n'a été modifiée.

## Validations globales

- Typecheck officiel complet : réussi après rétablissement de trois liens de dépendances déclarées sous node_modules (auth/database/security).
- Build web final : réussi ; 9 579 modules transformés. Le build est distinct du déploiement.
- Lint officiel : zéro erreur, 52 avertissements préexistants.
- Catalogue i18n et scan source : réussis, aucun résidu ajouté (21 résidus historiques dans quatre fichiers).
- Régressions API : 13/13 ; contrat nouveau moteur API : 18/18.
- BFF : 26/26 ; UI/callback conflits : 8/8.
- Réconciliation des sessions : 12/12 ; index documentaire : 6/6.

Moteur final : 15/15 tests réels isolés ; régressions de cycle de vie 12/12. Dix répétitions du parcours pas-à-pas réussies, sans retry. Le point d’arrêt d’entrée est temporaire ; le point utilisateur à la même ligne reste actif. Inspection et commandes sont sérialisées pour éviter les évaluations de frame pendant un pas.

## Échecs conservés

- Le pnpm global 11 tentait une installation et échouait sur son cache hors workspace ; pnpm 9.14.4 a été préparé sous /tmp. Aucun lockfile changé.
- Premier typage : trois liens node_modules manquants, rétablis vers les paquets déclarés du dépôt. Une invocation pendant modification API a lu une écriture transitoire invalide ; le contrôle final complet est vert.
- Deux anciens tests BFF attendaient le contrat pré-moteur ; ils ont été actualisés pour le lancement Node et le refus des commandes sur session legacy. Leurs garanties d'arrêt/persistance restent testées.
- Le premier scan i18n signalait deux codes protocole comme texte visible ; constante protocole partagée, sans exemption ni changement de seuil. Scanner ensuite vert.
- Revue : entrée CommonJS via import ne préservait pas require.main, répétition automatique d'un step après réponse perdue, et arrêt d'un enfant ignorant SIGTERM. Corrections avec tests spécifiques ; escalade réservée aux nouveaux processus debugger.

## Périmètre

Programmes Node .js/.mjs/.cjs, points d'arrêt par ligne, pause/continuer/pas suivant/entrer/sortir, pile, variables locales et expressions surveillées sans effet de bord. Pas d'attachement arbitraire, de source maps TypeScript, de moteur Python ou navigateur. Conditions/hit counts/logpoints et environnement spécifique ne sont pas acceptés pour le nouvel adaptateur ; les lancements historiques restent disponibles séparément.

Les valeurs d'inspection sont obtenues sous permission d'écriture et accès terminal, jamais sauvegardées dans le blob de configuration du projet. Les commandes de contrôle ne sont pas rejouées après erreur réseau. Les conflits CAS restent des échecs explicites même lorsqu'une action runtime est confirmée.

- Un essai concurrent du moteur a échoué après step-over (pile vide au lieu de la ligne attendue). La cause exacte n’est pas établie. Un chevauchement inspection/commande a été supprimé ; les répétitions suivantes passent. Aucun retry ni assertion affaiblie. Ce résultat ne prouve pas l’absence de toute intermittence.

## Réponse de contrôle incertaine

Une perte de livraison du canal est injectée après un vrai resume sur un vrai enfant : délai dépassé, état unknown, second pas refusé et arrêt confirmé. Un accusé de réception ne réaffiche plus l’ancienne pause. Le loader et le panneau conservent unknown, vident les cadres hors pause et autorisent l’arrêt avec relecture silencieuse.

## Suite finale et revue indépendante

Suite de la première tête fab0c7235 : **147/147 tests, 13 fichiers, zéro omission/retry**, dont 14 tests du nouveau moteur. Le premier run complet final avait 145 succès et un échec de fixture : la garde comparait les ports de toute la machine, affectés par des serveurs de suites concurrentes. Elle cible désormais l'UUID du processus débogué ; un témoin positif sur le même enfant prouve absence de port pendant la pause puis détection d'un vrai serveur HTTP loopback après reprise. Aucun code produit modifié pour cette correction.

Revue indépendante favorable : 25/25 moteur + cycle de vie avant témoin ports, 30 passages ciblés (10 répétitions de trois scénarios, sans retry), 26 BFF et 18 API ; relecture et **14/14 moteur** après témoin ports. Aucun défaut bloquant restant identifié, sans prétendre prouver la cause exacte de l'intermittence historique.

Le checkout n'installait pas automatiquement les hooks Git : `.husky/pre-commit` a été exécuté explicitement après le commit local. Gitleaks n'est pas installé localement ; son contrôle CI reste nécessaire. Aucun hook ou contrôle du dépôt n'a été désactivé.

## Complément navigateur réel — 25 octobre, avant nouvelle CI

**3/3 parcours complets, sans retry**, Chromium 154, à 1440, 820 et 390 px. Le build web appelle réellement le BFF HTTP puis l'API authentifiée/RBAC et PostgreSQL ; le gestionnaire signe les jetons et le vrai agent exécute Node. Aucun endpoint ne retourne de réponse fabriquée. L'espace synthétique est précréé dans la base : le provisionnement Kubernetes n'est pas testé.

À chaque format : configuration enregistrée, breakpoint ligne 6 et watch `answer = 2`, pause d'entrée, continuer, entrer dans `twice`, pas suivant jusqu'à la ligne 4, `doubled = 4` vérifié dans le moteur ET visible dans le panneau, sortir, reprendre, puis arrêter. Le statut final est confirmé par l'agent ; le registre ne contient plus le processus et les valeurs inspectées sont absentes du blob PostgreSQL. La largeur du document ne déborde pas du viewport. Revue visuelle indépendante des contrôles et variables sur les trois formats.

[Reçu expurgé](browser/receipt.json) · [Manifeste des sources et 2 307 fichiers de build](browser/provenance.json) · Variables [1440 px](browser/variables-1440.png), [820 px](browser/variables-820.png), [390 px](browser/variables-390.png). Neuf captures pause/variables/arrêt sont conservées. Les journaux bruts restent privés sous /tmp.

Deux défauts révélés pendant cette recette sont corrigés : le CTA disait « sans débogueur » pour une configuration Node ; deux breakpoints désignant le même emplacement faisaient échouer Inspector. Le libellé suit maintenant la sélection ; les emplacements sont dédupliqués après résolution du chemin canonique. La contre-épreuve des doublons échouait réellement avec 409 ; le test corrigé conserve deux entrées identiques et un symlink interne et vérifie que le breakpoint utilisateur reste actif sur deux appels. Revue indépendante et 15/15 tests moteur verts sur ce complément.

Limites observées : zéro exception JavaScript et zéro HTTP navigateur >=400 ; six erreurs console correspondent au blocage volontaire de fonts.googleapis.com et stackblitz.com. Les appels internes logs/snapshot du manager échouent avec 502 car aucun workload Kubernetes n'existe dans ce banc. Cela ne certifie ni les logs cluster, ni le provisioning, ni la production. Les watches sont évaluées dans la frame courante : `answer` est vérifié dans la frame appelante, son indisponibilité dans `twice` est explicitement affichée. Aucun Safari/appareil physique ou autre langage certifié.

Reproduction opt-in : base locale jetable `debugger_qa`, PostgreSQL 16 avec pgvector, 102 migrations du dépôt appliquées, build web courant, puis `DATABASE_URL=postgresql://postgres@127.0.0.1:55441/debugger_qa ./node_modules/.bin/vitest run --config vitest.debugger-browser.config.ts`. Chromium doit être disponible via CHROMIUM_PATH (défaut /usr/bin/chromium) et le port web 55442 libre. Une première image PostgreSQL sans vector a échoué à la migration 0010 ; elle a été supprimée avec son volume et remplacée dans le banc synthétique, sans modifier ni contourner les migrations. Le premier essai de fixture utilisait expect.poll dans beforeAll (non permis par Vitest) ; sa boucle de disponibilité bornée a été corrigée. Les runs desktop initial et trois formats précédents restent historiques ; le run final 4 est celui du reçu.

Validation finale du complément : **148/148 tests agent**, **52/52 BFF/UI/réconciliation/index**, plus les **31/31 API** inchangés, soit **231 tests locaux**, et **3/3 parcours navigateur réels** distincts. Build, hook complet de typage/lint et scanner i18n verts. Le conteneur PostgreSQL de recette est supprimé avec son volume après les essais ; aucun accès ni compte synthétique persistant n’est conservé. La CI exacte du prochain commit reste nécessaire.

## Intégration de main #781

`main d3adf5be9` est intégré par merge normal, sans rebase ni force-push. Git fusionne les textes sans conflit mais laisse le compteur de l'index à 485 pour 486 fiches : l'index est régénéré, union exacte des deux lots. Revue indépendante : deux branches AST Debugger, neuf helpers et 26 fichiers propres identiques à ad9946ff7 ; trois helpers BFF entrants, deux branches Packages et neuf fichiers entrants conservés exactement depuis main. Aucun écrasement identifié.

Sur la combinaison : **112/112 tests ciblés** (Debugger, callbacks/UI, exécution, scanner, workflows, Packages et index), build et hook complet typage/lint réussis. Aucun nouveau test navigateur de cette combinaison n'est revendiqué : les captures et empreintes précédentes restent attachées aux sources ad9946ff7, dont les blocs Debugger sont inchangés. Nouvelle CI exacte requise après publication de ce merge.
