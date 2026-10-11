# Validation de la hauteur au repos du clavier

La PR #664 conserve la hauteur au repos lorsque React remplace la coquille de
chargement par le chat. La reprise du 6 octobre limite cette mémoire à la durée
de présence de l’IDE : après une navigation et un changement de hauteur de fenêtre,
le retour ne doit pas masquer le menu inférieur alors que le clavier est fermé.

La libération différée à la microtâche conserve les remontages du même passage
React. Les tests couvrent le remplacement de la coquille, la navigation suivie
d’un redimensionnement, plusieurs mesures actives et une libération répétée.
Le scénario E2E de la PR retarde réellement la réponse de mémoire du projet pour
provoquer le remontage pendant la saisie. Validation CI et sur iPhone à distinguer.
