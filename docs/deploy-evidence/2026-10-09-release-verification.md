# Vérification de livraison — 9 octobre 2026

Autorisation : Avi a demandé « Continue et fusionne et déploie » le 09/10.
Ce document sépare fusion, livraison des images et parcours client réel.

## Livraison attestée : correctif des images serveur

- #683 fusionnée, main `6839158c41b838bbe45c51be44d6ba295cdd76b9`.
- Run [37845241136](https://github.com/openaxcloud/vibecore/actions/runs/37845241136)
  réussi : scan bloquant, signatures, Helm, rollout et comparaison des imageIDs
  avec les digests du manifeste réussis ; rollback post-contrôle non exécuté.
- Manifeste, artefact `11583219154` : neuf services, neuf signatures vérifiées,
  `fullyTraceable: true`, aucune lacune de provenance. Les neuf SBOM ne contiennent
  aucun composant npm Capacitor. Cela confirme l'exclusion des paquets mobiles
  des images serveur ; cela ne certifie pas la sécurité des applications natives.
- Rollout, artefact `11583536449` : 26 événements JSONL ; événement final du
  08/10 à 22:36:03 UTC, `commandExitCode: 0`, `evidenceComplete: true`.
  Quinze pods plateforme en phase Running sont prêts, sans redémarrage dans
  ce dernier snapshot. Le web comporte encore une ancienne réplique en drainage :
  ce snapshot ne se substitue pas à la vérification finale des imageIDs du job.
- Les cinquante Jobs Failed conservés dans ce snapshot sont historiques : leurs
  dernières minutes de planification vont du 16 juillet au 1er octobre. Ce nombre
  seul ne prouve pas cinquante pannes actuelles et ne justifie aucune suppression.

## Paiement : fusion attestée, nouvelle livraison en cours

- #684 fusionnée par cette session : main `a11d0a1687d8edb5a3f4b38f74031d230f289383`.
  Ses parents incluent main #683 et le head testé `b8f2a05483f3eca9e7fba23ede9848cba821f984`.
- CI, E2E, sécurité et qualité de ce SHA de fusion réussis. La porte de livraison
  et le preflight du run [37885667512](https://github.com/openaxcloud/vibecore/actions/runs/37885667512)
  ont réussi. Construction des images en cours lors de cette rédaction : **ce
  document n'atteste pas encore le rollout de cette version**.
- La protection refuse l'annuel sans prix annuel avant appel Stripe ; l'interface
  conserve la période et permet de revenir au mensuel. Gardes :
  `services/api/src/tests/api.spec.ts` et `app/routes/upgrade.i18n.spec.tsx`.
- Sondes web/API : HTTP 200, corps `{"status":"ok"}`. Accueil français rendu
  dans le navigateur. Ces mesures prouvent la disponibilité observée, pas la
  présence du nouveau correctif dans les images tant que le rollout n'est pas attesté.
- `/upgrade?interval=annual` redirige vers la connexion dans cette session.
  Aucun paiement réel effectué. Parcours connecté et responsive du paiement
  non attestés ; la fiche du bug reste ouverte sur la colonne « Testé live ».

## Validation des propositions : correctif distinct en attente

#685 traite la course d'enregistrement des contrôles, les deux contrôles CodeQL,
les erreurs ignorées et les permissions excessives du jeton. Six contrôles Node
et le garde de pinning passent localement. Le nom `.checks.mjs` distingue la suite
Node de la découverte Vitest, sans retirer son exécution obligatoire. Fusion
subordonnée à la réussite de la CI sur le dernier head ; aucune porte contournée.

## Contribution de Claude intégrée

#651 fusionnée sur main `243c315f98a541d9860efe2dd7e7bcbf776d0d4c` après
réussite de CI, E2E, sécurité, qualité, validation PR, desktop et audit français
du head `6b23b962f6699ea239199319335c12f78ec45e94`. Le nom générique de la
formule gratuite est harmonisé entre billing et upgrade, sans renommer les
produits ni supprimer la protection annuelle. Sa livraison et sa vérification
connectée en production ne sont pas encore attestées.

Le lancement global reste non validé : catalogue Stripe/devise/abonnements,
parcours client complet, isolation réseau effective, restauration, capacité et
surfaces promises restent soumis à leurs propres preuves.
