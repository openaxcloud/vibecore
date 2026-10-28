# Revue indépendante — assemblage palette823 + runtime822

Lecture seule de l’assemblage en cours dans `vibecore-ui-palette-recovery`, base commune `58fa0702a2824015e879665e227228f8b4d8c76a`, têtes source palette `f0e2af039cd3f3a7686cd5384fd824bd08e5f0e8` et runtime `b9ae8542ea7d9c5a21caf33912fe2dd516924ce0`.

## Verdict

**GO sémantique limité à l’assemblage ; aucun blocage d’intégration identifié.** Les validations consolidées et la CI de la tête combinée restent nécessaires avant publication/fusion/livraison selon la coordination parent.

## Contrôles indépendants

- Recalcul local des ensembles de fichiers modifiés depuis la base et comparaison de leurs blobs au contenu courant : **43 fichiers vérifiés, zéro différence**, seul chevauchement `BUG_INVENTORY_LIVE.md`. Aucun chemin non fusionné (`git ls-files -u` vide). L’index documentaire régénéré est distinct des preuves produit ; sa validation appartient au parent.
- Palette : BaseChat/provider/tests restent identiques à la tête déjà relue ; scope projet/fenêtre, durée de vie route, retour focus avec RAF annulable et fermeture restent inchangés.
- Runtime : `CommandRequest.lifecycle` est optionnel et limité à `preview-service`. Workbench le transmet uniquement au démarrage du serveur de preview, pas aux commandes de préparation. Les commandes ordinaires gardent leur échéance absolue ; aucune sélection de palette ne devient une observation de service.
- Le registre de baux appartient au workspace-agent ; renouvellement via observation `/ports` authentifiée. Arrêt explicite, expiration, sortie et fermeture agent restent bornés et nettoient les références. La présence d’un port reste distincte de sa disponibilité HTTP : le watcher API conserve les transitions ready/not-ready.
- Le watcher installe son nettoyage avant l’autorisation, ne poursuit pas les étapes après fermeture et évite les polls simultanés. Aucun raccord nouveau à la palette, aucun état partagé entre son provider React et les baux runtime.
- Tests lus : durée de vie/retour focus palette ; lifecycle service observé ou inactif, commande ordinaire, authentification, arrêt, expiration/escalade et fermeture agent ; watcher fermé pendant autorisation/lecture/probe et poll lent. Aucun ancien test palette affaibli dans cet assemblage.

## Interactions et limites

Une navigation de panneau ou un remplacement de coque peut réabonner l’observation runtime existante. Le lot822 rend précisément ce renouvellement explicite et borné ; le lot823 ne change ni ce transport, ni les commandes, ni les décisions de readiness. Conserver une requête de palette ne signifie pas conserver un processus ni déclarer le preview prêt.

Aucune nouvelle suite exécutée par le reviewer pour éviter de doubler les 45 tests palette, 97 workbench/remote et tests runtime prévus par le parent. Les dix workflows de822 sont rapportés par la coordination, non revérifiés via GitHub ici ; ils ne prouvent pas la CI combinée. Les captures palette et tests runtime séparés ne constituent pas une recette fournisseur/projet client ou une validation production de l’assemblage. Pas de mesure de performance nouvelle, ni garantie de continuité réseau au-delà du bail configuré.

Aucun fichier produit/index modifié, aucun commit/push/fusion/annulation/rerun CI par le reviewer. Les restrictions et anciennes opérations refusées ne sont pas contournées.
