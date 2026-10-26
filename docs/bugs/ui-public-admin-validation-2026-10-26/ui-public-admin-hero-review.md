# Revue indépendante — héros public Déploiements

**Avis favorable au dernier delta source, avec réserve explicite de recette compilée finale.** Lecture seule de `/workspace/vibecore-ui-public-admin`, diff de `app/components/marketing/ecode-exact/pages/PublicDeploymentsPage.tsx` contre7759cbcbd. Aucun navigateur, test ou build relancé par cette revue.

## Périmètre et conservation

Deux zones de classes seulement changent : le CTA documentation reçoit `h-auto !min-h-[44px] whitespace-normal`, et la grille des trois highlights devient `repeat(auto-fit,minmax(min(100%,14rem),1fr))`. Les trois cartes restent produites par la même liste, mêmes textes/catalogue/icônes/ordre et tailles typographiques. Aucune fonction ou illustration supprimée ; les constantes illustratives existantes restent inchangées, sans nouveau mock.

Les liens restent `/docs` et `/contact-sales`. Ni leur handler, ni leur état, ni le contenu des CTA ne changent. La grille choisit le nombre de colonnes selon la largeur disponible plutôt que d’imposer trois colonnes dès sm ; le minimum borné par100% permet une colonne dans le conteneur étroit. La hauteur automatique permet le repli du CTA sans imposer une hauteur fixe.

Le fichier est consommé par la route marketing.deployments et le registre EcodeExactProductMarketingPages ; il ne contient ni moteur/panneau IDE ni action backend. EcodeExactUi, la navigation publique commune, les styles globaux, Git/Publish/Deploy/Domaines et le hub Intégrations ne sont pas modifiés par ce delta. La page `/deployments` utilisant l’autre renderer EcodeProductMarketingPages n’est pas assimilée à une recette de cette page.

## Preuve de cause et échec conservé

La baseline décrit le chevauchement de titre à1024 : cartes146,9px et titre~97px disponibles. Les contrepreuves de grille puis du CTA distinguent le chevauchement interne d’un simple scrollWidth du document. La solution de simple coupure de mots dans trois cartes trop étroites a été écartée ; aucun besoin d’abaisser la police ou de masquer le contenu.

La première recette compilée after13799 est réellement en échec : trois observations FRclair320/360/390 et un groupe clavier seulement, puis CTA documentation22px à844×390. Le reçu porte status failed ; il ne valide pas les44observations/8groupes prévus. `EcodeExactUi.tsx:117` ajoute `md:min-h-0` au variant lg. `diagnostic.json` montre cette classe, minHeight0 et hauteur22 avec h-auto ; la liste CSSOM vide ne sert pas de preuve positive.

Les huit contrepreuves stabilisées FR/EN×844/820/1024/1440 appliquent min-height44!important et mesurent22→44, texte et href conservés. Les premières lectures trop précoces restent exclues de ce verdict après transition. Le `!` local du delta final répond donc à la cause précise sans changer le variant partagé. Une injection inline n’établit toutefois pas à elle seule que l’utilitaire important sera généré et gagnera dans le build final.

## Condition de validation finale et limites

Attendre la recette du build final :44observations/8groupes prévus ou dénominateur exécuté exact, trois cartes conservées, Range des titres/CTA dans leurs bornes, CTA≥44px après stabilisation, docs/contact destinations intactes, clavier et Retour. Mesurer particulièrement320FR,844paysage et1024 ; les anciens reçus ne doivent pas être remplacés par une affirmation globale verte.

Le README principal conserve encore des formulations historiques « aucune recette compilée »/« proposition non appliquée ». Avant publication, le parent doit les contextualiser comme baseline, puis distinguer after13799 échoué et la future recette finale ; le README after13799 est déjà précis. Ce point documentaire ne bloque pas le delta source mais empêche de présenter l’ensemble des preuves comme une validation finale achevée.

Aucune certification production, Safari/Firefox, clavier virtuel, safe areas matérielles, contraste WCAG ou tous textes futurs. Revue favorable localisée ; la recette finale reste en attente au moment de ce rapport.
