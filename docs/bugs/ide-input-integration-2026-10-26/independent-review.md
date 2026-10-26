# Revue indépendante cumulative — continuité de saisie IDE

Tête examinée : `cd0dd515e22772d37f1cbcb50c27dfd6cc26d48b` ; parents `cb56e8341b8b397dc0150ea8caad8e2380c2fb85` et `2e2b04228a60fba8404521e8a02c1ec4328db751`.

## Verdict

Avis favorable sur le code et la résolution de fusion, sous réserve des validations sur cette tête. Aucun blocage nouveau identifié. Aucun produit modifié ni test relancé par cette revue.

## Conservation vérifiée

Comparaison des fichiers modifiés depuis la base commune : tous les fichiers propres à chaque branche sont conservés à l’identique, hors index dérivé. Deux chemins ont été modifiés des deux côtés : l’index et `services/api/src/tests/lecture-declenche-provisionnement.spec.ts`. Ce dernier est identique aux deux parents dans la fusion ; il ne constitue pas un conflit résiduel ni un nouveau delta backend. L’index contient exactement 519 liens pour 519 fiches, sans doublon ni cible absente. `git diff 2e2b04228 HEAD --check` passe.

## Lecture du delta produit

- Recherche des onglets mobile conservée dans le provider commun ; les handlers existants gardent leurs réinitialisations. La clé projet/workspace/window remonte intégralement ce provider lors d’un changement de portée.
- Contribution native Monaco Ctrl+M chargée avec editor.api et attendue avant création. Le comportement clavier reste l’oracle ; absence de getAction local ne signifierait pas absence de cette action globale.
- Focus capturé seulement au démontage de la coquille, pour un éditeur effectivement focalisé. Identité pane+fichier, revendication dans le même commit, expiration microtask et génération invalidée par interaction évitent la restauration différée après fermeture ou interaction ailleurs. La conservation du jeton en replay StrictMode reste présente.
- ViewState restauré avant focus seulement si URI, contenu du modèle et dernière valeur des props correspondent au snapshot. Le garde du modèle emprunté est conservé. Aucun nouvel autofocus global.
- Composition native suivie par jeton d’éditeur dans la même portée ; abonnements et jetons nettoyés au dispose. Le verrou Chat retarde uniquement l’activation initiale tant que composition ou geste pointeur est actif, puis reste activé. Annulation des timers et nettoyage des listeners présents ; les sept tests couvrent reprise de composition, clic, multipointeur, blur et démontage.

## Validation et limites

QA cumulative de 17 scénarios et validations unitaires/types/lint confiées aux agents propriétaires : résultats non encore certifiés par cette revue. Les cas de tests présents couvrent notamment StrictMode, fermeture/réouverture, changement de portée, contenu divergent, modèle emprunté et compositions simultanées. La recette finale doit confirmer caret/texte exact, absence de vol de focus, Ctrl+M/Tab et fin de clic réel sous composition.

Le verrou IME cible ready → ChatImpl : ne pas généraliser aux transitions Suspense antérieures. Les preuves Chromium CDP restent un harnais synthétique, pas un IME matériel, Safari ni une QA authentifiée en production. Les diagnostics CI #802 n’établissent toujours pas la causalité originale ni une fuite interprojet ; leur inclusion documentaire ne constitue pas un correctif produit de ces intermittences.
