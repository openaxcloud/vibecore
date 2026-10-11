# A-24 et A-26 — textes utiles au client

Base : main c7a6fa5025c18419988173179f8f30044d0253b3. Deux fusions réelles : fix/messages-sans-jargon (seul conflit : index dérivé régénéré), puis fix/consigne-portee-n-est-pas-un-refus (sans conflit). Aucune livraison revendiquée.

A-24 remplace des détails d’erreur internes dans les réponses publiques, les messages de déploiement et les e-mails. Les tests s’appuient sur les catalogues réellement utilisés et vérifient à la fois l’absence des termes techniques et la conservation d’un texte exploitable. 60 tests API dans deux fichiers sont verts ; les types complets et le build API passent.

A-26 distingue une consigne limitant les modifications (« ne modifie rien d’autre ») d’un refus de produire des fichiers. Le détecteur parcourt toutes les occurrences pour conserver un refus réel présent ailleurs dans la même demande. Les 45 tests de annonce-sans-artefact passent et le lint des deux fichiers est vert. Les types complets du lot passent. Le build React Router final passe également. Les contre-épreuves utilisent le code main dans un arbre séparé : six échecs sur 45 tests pour A-26, et 39 échecs sur 43 tests de messages publics pour A-24 ; les gardes détectent donc le retrait des correctifs.

Ces validations sont locales ; le verdict CI et les parcours réels restent nécessaires avant de déclarer les points livrés.

Limite lint : la commande appliquée aux trois fichiers API historiques compte 27 erreurs déjà présentes sur main. Les nouveaux écarts d’import/commentaire ont été corrigés ; le nouveau test API et les deux fichiers du détecteur passent le lint. Aucun passage global du lint API n’est revendiqué.
