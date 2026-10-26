# Revue indépendante — contraste ReportAbuse et sémantique publique

Lecture seule du worktree public-admin, commits4c4b17faa et intégrationcc5574d67 (issue du lot93af), le26octobre2026. Aucun changement, test, navigateur ni build supplémentaire lancé. Avis favorable à la recette compilée en cours ; aucun défaut source bloquant identifié.

## ReportAbuse : deux liens seulement

Les href /terms et /acceptable-use, textes, structure et handlers restent identiques. La classe text-primary devient text-[var(--ecode-accent-text)] sur les deux ancres. Token existant déclaré sombre#ff8a3d et clair#a94100, sans changement global. hover:underline conservé ; aucun attribut tabindex/role ni action affecté. Le correctif main et nom du radiogroup antérieur demeure intact.

Reçus et contrepreuve relus : défaut clair calculé3,034:1, texte12/14px normal ; huit contextes contrepreuve FR/EN×thèmes×320/1440. Seize mesures ciblées trouvent5,94clair/7,77sombre, sans échec. Il s’agit d’injection couleurDOM et pas encore de cascade compilée corrigée. Les gradients/opacité et états nonévaluables sont exclus explicitement ; les captures Reset initiales ne sont pas utilisées pour conclure à un défaut. Pas de certification de tous les contrôles/erreurs, hover/focus, contraste global ou production. Cinq tests existants rapportés verts ; ils ne remplacent pas les mesures de contraste.

## Sémantique : liens uniques et landmarks

Relu diff en ignorant le reformatage des quatrepages/sections : douze paires Link>Button remplacées par Button asChild>Link, main ajouté aux deuxpages qui en manquaient, incluant sectionDeploymentslazy et excluant navbar/footer. Bounties avait son main. Textes/href/icônes/classes spécifiques conservés, y compris !min-h44 de docsDeployments. Aucun composant commun ou action métier modifié.

asChild n’est pas un simple marqueur : EcodeExactUi clone réellement l’enfant et fusionne classes/props. Son Link relaie props vers RemixLink pour ces hrefinternes ; résultat natif attendu Aunique. Aucun de ces usages ne dépend d’un ref de bouton, disabled ou comportement submit perdu. Les classes w-full/sm:w-auto existant aussi sur LinkTeams sont compatibles. Aucun contrôle n’est retiré ; la sémantique lien correspond à la navigation.

Le test conserve les vrais Link/Button/Router, isole seulement coque, attend la sectionlazy, vérifie les quatre destinations parpage/langue, un main et absencea/buttonimbriqués.6rouges→6verts+21catalogues rapportés, pas rejoués par cette revue. Baseline48contextes/192CTA ne prouve pas le rendu corrigé. Le changement d’itemflex (ancien wrapperA, désormais Ainline-flex) et les sélecteursCSS a/button exigent mesuresaprès : Range du texte, hauteur44, bornes, icônes, Tabunique et Enter/Back. Le harness préparé les distingue correctement de la baseline.

## Conditions de clôture

Attendre les reçus compilés communs pour les16mesures ciblées contraste et les pages asChild ; ne pas substituer testsDOM ou classes aux dimensions calculées. Inclure les sections différées et vérifier thèmes. Les recettes ne valident ni navigation complète fournisseur/inscription, ni lecteursécran/OSphysique, ni production. Les README conservent les chronologies avantcorrectif puis étatlocal ; leurs titres initiaux « aucune modificationproduit » décrivent l’audit, la sectioncorrectif finale explicite bien l’état ultérieur.

Aucun blocage confirmé à ce stade ; acceptation finale géométrie/contraste reste conditionnée au build commun et à sa recette, actuellement en cours selon parent.
