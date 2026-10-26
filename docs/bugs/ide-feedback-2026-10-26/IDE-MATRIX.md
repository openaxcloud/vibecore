# IDE : preuves distinctes au 26 octobre 2026

Base examinée : `951ceb8d5653bee4df30b010753c859c0c4a44c0`. Aucune certification globale de l’IDE.

| Parcours | Preuve disponible | Limite actuelle |
| --- | --- | --- |
| Créer / importer | CI : création API locale et import ZIP synthétique, puis lecture dans l’UI. | Génération IA complète et import GitHub distant non prouvés. |
| Éditer | CI : Monaco, frappe, brouillon et identité d’onglet. | Écriture persistée après édition puis rechargement non démontrée par ces tests. |
| Recharger | CI : sélection/restauration de fichiers déjà importés. | Ce n’est pas une preuve de sauvegarde d’une nouvelle édition. |
| Packages | CI : rendu du panneau. | Installation effective non exécutée par cette session. Le lot runtime séparé #805 apporte ses propres preuves, à lire indépendamment. |
| Shell | Local réel : PTY, fichier écrit/lu, cwd/variable de test persistants, réattachement. | Appel direct du gestionnaire produit ; pas le WebSocket protégé ni le bouton IDE. |
| Run / Stop / restart | Local réel : deux cycles Node, HTTP200, interruption, port fermé, nouveau PID. | Pas le provisioning cloud, le manager ni les boutons de l’IDE. |
| Preview | Serveur Node local réel et contenu HTTP attendu. | Pas le proxy produit ni l’iframe ; la capture utilisateur du portfolio est un témoignage distinct. |
| Git | CI : indexation et commit Git local réels sur projet jetable. | OAuth distant bloqué chez l’utilisateur ; cause non établie. Aucun POST authentifié observable dans cette session. |
| Publish | CI : navigation, confirmations, erreur503 synthétique et récupération. | Aucune publication cliente réelle, DNS ni rollback effectif testé. |
| Vignettes Projets | Défaut de reprise après erreur reproduit sur le composant. | Ni capture, stockage, ni projet utilisateur vérifiés en production. |
| Notifications / agents | Chaîne d’émission identifiée et corrections de présentation en cours. | Pas de garantie sur la réussite de l’orchestration backend. |

## CI et production

La Production E2E de #801, run40269036163 tentative2, rapporte **482 passed +26 skipped =508 résultats /87 fichiers**, sans échec, flaky ou dérogation. Elle exclut `@runtime` ; ce résultat ne couvre donc pas l’IDE exécutable entier. La livraison de la plateforme #801 n’est pas une preuve de publication d’un projet client.

Les tests locaux de processus ont utilisé des répertoires isolés, sans credential nouvellement créé, compte client, IA, réseau fournisseur ou installation. `/health` répond200 ; `/files/read` sans jeton répond401. Aucun contournement de cette protection. Tous les PID propres ont été arrêtés et les ports fermés ; une observation de nettoyage `disposeAll` a été transmise au propriétaire runtime.

## Authentification et navigateur

Aucune session E-Code existante identifiée : métadonnées de64bases de cookies contrôlées, aucune valeur lue. Aucun navigateur actif. L’entrée sûre est `https://app.e-code.ai/login?returnTo=%2Fdashboard`, mais le navigateur local échoue avant HTTP avec `ERR_TUNNEL_CONNECTION_FAILED` et cet environnement ne propose pas de transfert sécurisé pour une connexion utilisateur. Aucun mot de passe demandé, aucun nouveau grant OAuth.

Le statut/code du POST `/api/integrations/oauth/github/connect` dans la session réelle demeure nécessaire au propriétaire backend. Le message « Impossible de lancer le flux OAuth GitHub. » ne prouve pas une configuration fournisseur absente.

Les nouveaux tests UI seront synthétiques et locaux. Safari iPhone physique, clavier virtuel réel, safe areas matérielles, Firefox et recette production authentifiée restent non validés. Les captures utilisateur décrites par le parent ne sont pas des captures prises par cette session ; leur matérialisation Library a échoué.
