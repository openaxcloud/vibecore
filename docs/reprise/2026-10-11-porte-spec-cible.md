# Porte E2E ciblée — B-15

Fusion réelle sur main après #709 : un seul conflit, dans l’inventaire dérivé, résolu par régénération. Le filtre documentaire et le canari de #709 sont conservés.

Un passage ciblé joue le même spec dans quatre tranches. La porte vérifie maintenant la présence de tests dans chaque rapport indépendamment des tests déjà vus, attend le fichier demandé et conserve tout échec rencontré, quelle que soit la réussite d’une autre tranche. Le workflow transmet son entrée `spec` à la porte. La couverture de la suite entière et les exigences de rapports restent contrôlées.

Dix tests dans deux suites passent (quatre comportements du programme réel et six de l’index). Le programme est copié sans modification dans un dépôt temporaire, avec deux specs et une dérogation de test bornée : aucune modification de la politique de production. Les tests vérifient les messages et le code de sortie, et nettoient leurs fichiers temporaires.

Remettre uniquement le programme de main rend trois comportements rouges, un reste vert. Retirer uniquement la conservation d’un échec rend un test rouge, trois restent verts. Lint ciblé et syntaxe JavaScript verts. Cette correction ne joue aucun test navigateur : le passage réel en CI reste à vérifier après ouverture de sa proposition.
