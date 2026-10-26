# Organisation : sélecteur, sécurité et SIEM

Audit lecture seule du build796 existant /workspace/vibecore-ui-major/build, base1714415cb. Serveur10499/API5499 isolée, fixtures synthétiques seulement. Aucun nouveau build, source, index ou commit modifié. Aucun appel de création, sauvegarde, test SIEM, suppression, export, rôle ou permission. Tiers et toutes mutations bloqués, secrets non renseignés.

## Matrice et résultats

48 observations = trois routes ×320/390/768/1440 ×FR/EN ×clair/sombre. matrix.json,12captures320. Zéro erreurJS. Les mesures incluent les éléments masqués du shell, sr-only et les tableaux intentionnellement scrollables : ils ne sont pas automatiquement des défauts.

Défauts reproduits :
- organization-security : nom d'organisation non sécable dans la description AppShell, client255/scroll2330 à320; document320 masque le débordement interne. DOM overflow-wrap:anywhere ramène255/255. Le composant partagé nécessite accord de périmètre.
- organization-siem : document371px à320FR et403px à320/390EN, six observations concernées. Cause : span sr-only absolu du header Actions déborde de son scrollport non positionné. Contrepreuve position:relative sur conteneur de table ramène document320. Le tableau conserve son défilement horizontal.
- organization-switcher : CTA Nouvelle organisation33pxà1440, contrepreuve min-height44px positive. Seuil44px demandé, pas assertion automatique de non-conformitéWCAG.
- organization-switcher : Escape ferme le dialogue mais le focus retourneBODY, confirmé350msaprès. Dialog partagé fournit déjà restoreOpenerFocus, non activé sur cette route.

counterproof.json correspond à des changementsDOM temporaires, PAS à un correctif compilé. proposed-not-applied.patch est une proposition, non appliquée.

## Parcours

interactions.json: huit groupes. Switcher: ouverture dialogue, saisie non enregistrée,resize390→320,Tab,Escape (fermeture positive mais focus défaillant). Security etSIEM: brouillon d'input,resize1440,Tab,Escape,restaurationchamp,Back. Security etSIEM:GET503 et403 puisRecharger récupèrent. SwitcherGET503:alerte, retourdashboard proposé, pas deRetry; rechargement navigateur après restaurationfixture récupère. Aucun bouton de sauvegarde/test/suppression activé. failures.json restauré{}. Navigateurs fermés.

## Limites

Pas de recette production, backend réel, SSO, mutation, export, zoom, clavier virtuel, contraste calculé ou tailles supplémentaires. Inputs texte longs ont leur scroll natif; contrôle précis des checkbox/labels et safeareas non réalisé dans ce lot. Le lien textuel SIEM audit est inférieur44px mais n'est pas assimilé automatiquement à un bouton. La navigation shell hors périmètre présente des mesures internes : pas de modification de cette navigation.

PID119341 : horaire23:03:12 et commande react-router-serve cohérents avec notre ancien9399, mais environnement/cwd /proc inaccessibles; aucune preuve certaine de correspondancePID/port, aucun processus arrêté.

## Correctif autorisé et validation locale

Le 26 octobre, le parent a confirmé la vérification des31PR ouvertes et autorisé uniquement organization-switcher.tsx, organization-siem.tsx et la classe de description AppShell. Patch appliqué dans /workspace/vibecore-ui-coverage : CTA/Annuler Switcher min-height44px, prop existante restoreOpenerFocus sur son Dialog, conteneur SIEM relative, repli de mots de description AppShell. Aucun changement de navigation ou composant modal global.

Contrat du nom confirmé avant application : services/api/src/app.ts:904 createOrgSchema = z.object({name:z.string().min(1),slug:z.string().min(2).optional()}); handler POST/orgs:21590 transmet body.name directement au store. packages/database/prisma/schema.prisma Organization.name est String sans longueur varchar bornée. Le nom synthétique mesuré comporte324caractères et respecte ce contrat. Aucun appel de création réel ou synthétiquePOST n'a été exécuté pour cette vérification.

37tests existants/4fichiers réussis (Switcher4,Security7,SIEM6,SaaSLayout20). ESLint ciblé3fichiers code0. Voir tests.log etlint.log. Source gelée pour build,typage,revue indépendante et recette compilée par parent. Les contrepreuves précédentes restentDOMuniquement; aucun verdictaprèsbuild à ce stade.
