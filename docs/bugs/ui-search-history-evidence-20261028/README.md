# Search : retour coalescé — preuves locales

Chromium local, vrais composants compilés, API/runtime synthétiques. Ancienne tête df6cb737f : scheduler-normal-final échoue (URL Search idle, surface Agent, champ présent caché). scheduler-no-hold est le contrôle sans retard.

Correctif : un POP invalide les effets mobiles qui relisent la route courante, après navigation idle et concordance exacte pathname/query. Aucun état de destination périmé mémorisé ; aucun changement desktop.

Build corrigé : compiled-search-final 390/768 et compiled-search-immediate 390/820, quatre recettes vertes, zéro erreur JS. Même retard MessageChannel borné1500ms puis libéré ; vrais clics et historique, aucune assertion réduite. Recherche et Retour/Suivant validés. Sept tests React réussis couvrent également le sens inverse et une nouvelle intention pendant un loader ; ces scénarios supplémentaires ne sont pas tous exercés dans le navigateur compilé.

Build client/SSR, typage complet, lint0erreur/52avertissements existants, revue indépendante. Le script contient des chemins absolus du harnais local : adapter ceux-ci pour reproduction ailleurs. Aucun backend réel, Safari, appareil physique ou production validé. Le retour interprojetB→A#834 reste distinct et ouvert.
