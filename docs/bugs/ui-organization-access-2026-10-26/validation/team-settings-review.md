# Revue indépendante — route enfant des paramètres équipe

Avis favorable à la proposition `/tmp/ui-org-access-next/proposed-team-outlet.patch`, sous réserve des validations après application. Revue en lecture seule dans `/workspace/vibecore-ui-org-next` ; aucun fichier produit ou test modifié par le relecteur.

Cause confirmée dans la source : `teams.$id.tsx` rend le journal et son EnterpriseFormPage sans Outlet ; `teams.$id.settings.tsx` possède déjà sa propre page et coquille. Dans l’arbre imbriqué flatRoutes, l’enfant est donc masqué par le parent. Les captures/reçus de l’agent et le test rouge réel confirment le défaut, indépendamment du simple constat source.

Le patch importe useOutlet, l’appelle inconditionnellement après les hooks existants et retourne l’enfant avant de construire la coquille du journal. L’ordre des hooks reste stable entre overview et settings. Il n’ajoute pas de seconde EnterpriseFormPage/AppShell, ne retire pas le journal à l’URL parent et ne modifie ni loader, action, droits, endpoint, catalogue ou navigation partagée.

Le nouveau `team-routes.navigation.spec.tsx` utilise createMemoryRouter/RouterProvider et les vrais Link/useLoaderData/useOutlet. Il vérifie l’accès direct à l’enfant avec ses propres données, une seule coquille/un seul panneau, puis le clic réel vers settings et le retour historique au journal. Les mocks limités à EnterpriseFormPage et TeamAccessLogPanel isolent le défaut de nesting ; ils ne prétendent pas valider le rendu complet des panneaux. La substitution Request node-fetch est locale au test et réinitialisée après chaque cas. Le premier échec de harness AbortSignal est conservé séparément ; `teams-navigation-before.log` montre ensuite deux échecs produit sur le titre enfant absent.

Pas de blocage identifié dans le patch concret. Après application, exécuter les deux régressions et la suite i18n existante, puis vérifier le rendu compilé settings/overview et Retour avec une seule coquille. Le parent loader reste exécuté pour l’enfant : comportement de routing préexistant, pas optimisé ni supprimé par cette correction. Les tests emploient des loaders synthétiques et ne valident pas les autorisations backend réelles.

L’agent rapporte une inspection de31PR ouvertes sans chevauchement des fichiers concernés ; cette information de coordination n’a pas été revérifiée via GitHub par cette revue. Aucun backend réel, commit, push, fusion ou déploiement effectué. Le lot UI du parent reste indépendant.
