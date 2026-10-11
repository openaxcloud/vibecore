# Composants sans import — B-16 à B-19

Une seule reprise du lot de quatorze modules : fusion réelle de `chore/remove-dead-components` sur main après #709, sans conflit. Le second lot de suppression n’est pas importé en doublon. Les changements de workflows et autres dérives ne sont pas repris.

Le détecteur relit les imports par l’AST TypeScript : imports nommés, réexports, imports dynamiques littéraux, effets de bord, require littéral et dépendances de types. Les commentaires et chaînes ordinaires ne comptent pas ; deux modules de même nom sont distingués par leur chemin. La dépendance de type est conservée pour ne pas supprimer un module nécessaire à la compilation.

Mesure après suppression : 1 488 sources application et 449 modules composants examinés. Aucun des quatorze modules retirés ne possède d’import parmi ces sources. DatabaseWorkbench fournit un témoin positif de module utilisé. Trois modules supplémentaires restent sans import : `dashboard/prechauffer-coquille-publique`, `deploy/cron-expression`, `marketing/ecode-exact/pages/Pricing`. Ils sont inscrits explicitement dans la dette du cliquet, à examiner séparément. Le cliquet refuse toute nouvelle entrée ou une dette devenue périmée.

46 tests dans huit suites passent ; types et construction web verts, lint du détecteur et de sa garde vert. Réintroduire le vrai ModelSelector retiré rend la garde rouge (un échec, neuf témoins verts) ; après retrait, elle repasse au vert.

Limites : preuve d’absence d’import dans les sources app examinées, pas preuve générale d’accessibilité à l’exécution pour tous les modules référencés ; les imports dynamiques non littéraux ne sont pas résolus. La branche `chore/dead-surface-factories` recouvre les pages publiques reprises séparément pour A-27 et ne doit pas être fusionnée en doublon. Préparé, pas servi.
