# Défilement du transcript : preuve isolée et intégration

Correctif importé du commit `90f928fc9ef67c36166a250c1504efe13b77fe9a`, basé sur main `0d6b2edfb`. Deux fichiers : useStickToBottom.tsx et useStickToBottom.conteneur.spec.tsx. Le commit local d'intégration est `d8cc81e7e` ; aucun changement de BaseChat pour ce correctif.

## Preuves isolées conservées

- [Avant](isolated/before.json) et [capture](isolated/before-resize.png) : la remontée top2863→0 est annulée par le resize immédiat, top2993 et bouton absent.
- [Deux régressions rouges](isolated/unit-before.txt), puis [neuf tests verts](isolated/unit-final.txt), dont clamp au nouveau bas et animation explicitement non interruptible.
- [Douze cas Chromium](isolated/after-matrix.json) : 390/768/1024/1440 × normal, scroll+resize immédiat, scroll natif+resize. Après1200ms top0 et bouton présent ; le clic atteint le bas mesuré. Deux captures représentatives sont conservées, pas une copie de toutes les images.
- [Revue indépendante](isolated/independent-review.md) et [empreintes](isolated/source-hashes.json). Ces preuves ont été exécutées par la session propriétaire sur le vrai hook React isolé, pas dans le shell complet.

Le harness est conservé dans harness/ avec ses chemins adaptés au dépôt. Il importe toujours le hook produit ; cette adaptation de chemins n'est pas une nouvelle exécution des douze cas. Une recette du build commun est disponible séparément dans le README principal : trois parcours du transcript compilé à1440px, pendant réception de texte et de reçus modèles.

## WebKit et limites

Le binaire WebKit était absent. L'installation avait reçu HTTP403 « Domain forbidden » ([log conservé](isolated/install.txt)). Aucune nouvelle tentative, installation système ou contournement. Le lien avec le flaky WebKit CI n'est pas établi ; Chromium local n'est pas une preuve Safari/iOS.

Le harness isolé utilise un bouton sticky pour rendre le clic mesurable et du texte synthétique. Il ne certifie pas le style complet IDE, le contraste, les permissions ou un moteur distant. Les premiers essais de harness (import CommonJS, mauvais accès window.scroll, lecture avant fin d'animation) ont été exclus du résultat final par son propriétaire.
