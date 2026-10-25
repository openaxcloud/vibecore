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
- BFF : 26/26 ; UI/callback conflits : 7/7.
- Réconciliation des sessions : 12/12 ; index documentaire : 6/6.

Moteur final : 13/13 tests réels isolés ; régressions de cycle de vie 12/12. Dix répétitions du parcours pas-à-pas réussies, sans retry. Le point d’arrêt d’entrée est temporaire ; le point utilisateur à la même ligne reste actif. Inspection et commandes sont sérialisées pour éviter les évaluations de frame pendant un pas.

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
