# Navigation ordinaire puis déplacement — recette combinée du 22 octobre

La CI de `afe8a440` était verte (452 succès directs, 26 omissions, zéro flaky), mais la contre-épreuve de revue a reproduit **3→4 onglets** : une sélection normale lançait une navigation sans marqueur de déplacement, puis un déplacement pendant cette requête perdait son reçu. Aucun merge de cette tête n’a été effectué. [Rouge, capture et limites](../navigation-echo/normal-click/README.md).

## Correction

Le build produit `edb558bc326be7075ce042beeea25685a0e8864f`, arbre `6c843eb162b44c8b519e31f296752b3deb583c24`, reconnaît la clé React Router d’une navigation déjà en cours sans marqueur. Le reçu reste lié à cette navigation et à son projet/workspace/fenêtre/onglet/destination. Si la navigation finit ailleurs, un effet déclaré avant la synchronisation URL efface le reçu. Cela évite de conserver le reçu d’un Retour annulé dont la clé historique pourrait être réutilisée.

Le neuvième scénario annule réellement un Retour par Avance, sélectionne l’autre onglet, puis revient à la même clé d’historique. Il passe aussi sur l’ancienne version d0, qui effaçait déjà le reçu non marqué : ce contrôle protège contre une régression du nouveau mécanisme ; il n’est pas présenté comme un ancien défaut corrigé. L’essai de préparation ayant compté aussi le contenu du panneau a été rectifié en ciblant les éléments `role=tab`, avec le même nombre attendu.

## Provenance

9 339 sources suivies comparées aux blobs de `edb558bc` avant compilation. 2 306 fichiers compilés vérifiés intégralement dans l’archive locale SHA-256 `67b8bcca0e4f64d470970f1b9eeffa5d890023bf38be2abf778d929234e5a318`. L’archive n’est pas publiée. `/login` répond 200 sur le serveur local 5221 et l’asset JavaScript servi correspond octet pour octet au build. Les manifestes utilisent seulement chemins relatifs et empreintes.

Le produit et les tests restent figés pendant les recettes ; les ajouts suivants concernent uniquement les preuves et l’index. Les preuves des builds précédents restent dans leurs dossiers historiques.

## Résultats et reproduction

**75/75 tests navigateur passent directement, zéro retry, zéro omission** : neuf RPL/navigation, 45 IDE, trois fichiers (dont Retour B→A téléphone/tablette), six confirmations et douze menus EN/FR desktop/tablette/mobile. Le détail par action et les empreintes des rapports locaux figurent dans `actions.json`. **49 unitaires passent**, dont les gardes de re-clic/revalidation, documents et Escape. Build, typage et lint passent par les hooks normaux (52 avertissements lint existants, zéro erreur).

Node 24.19.0, pnpm 9.14.4, Chromium système, API compilée locale 3017, PostgreSQL dédié et nouvelles organisations/projets synthétiques isolés avec quotas normaux. Aucun compte réel ni credential fournisseur. Les configurations exactes sont jointes ; la copie locale du test RPL ne change que le répertoire des captures. Les sessions et connexions privées ne sont pas publiées.

Les tests suspendent puis libèrent la continuation d’une vraie requête React Router, sans réponse simulée ni délai fixe ajouté. Les cas interrompus exigent un échec réseau réellement observé. Les assertions d’identité, de nombre, de sélection et les délais ne sont pas assouplis.

## Limites

La disparition de palette globale pendant préparation reste ouverte et non corrigée ; les nouveaux tests de navigation utilisent le bouton Déploiements, tandis que les deux RPL historiques conservent leur parcours palette. Les tests flottants interceptent runtime/sauvegardes : aucune certification de persistance distante. B→A reste historiquement intermittent sans cause établie. Les états UI synthétiques ne prouvent pas une exécution fournisseur, terminal ou Git distante. Aucune réparation du projet réel utilisateur, certification complète de panneau ou livraison production revendiquée. La CI et la revue de la nouvelle tête restent nécessaires.
