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

## Paiement : fusion attestée, livraison bloquée avant Helm

- #684 fusionnée par cette session : main `a11d0a1687d8edb5a3f4b38f74031d230f289383`.
  Ses parents incluent main #683 et le head testé `b8f2a05483f3eca9e7fba23ede9848cba821f984`.
- CI, E2E, sécurité et qualité de ce SHA de fusion réussis. La porte de livraison
  et le preflight du run [37885667512](https://github.com/openaxcloud/vibecore/actions/runs/37885667512)
  ont réussi, ainsi que les constructions runtime et web. Le contrôle de
  vulnérabilités a ensuite échoué ; Helm et la comparaison des imageIDs ont
  été sautés. **Cette version n'a donc pas été livrée par ce run**.
  L'artefact `11597528856` contient neuf inventaires CycloneDX, sans rapport de
  vulnérabilités ni manifeste final. Leur champ `vulnerabilities` absent ne
  prouve pas l'absence de CVE. La cause exacte du scan reste inconnue : les
  journaux volumineux renvoient `Transport closed` dans cette connexion.
- La protection refuse l'annuel sans prix annuel avant appel Stripe ; l'interface
  conserve la période et permet de revenir au mensuel. Gardes :
  `services/api/src/tests/api.spec.ts` et `app/routes/upgrade.i18n.spec.tsx`.
- Sondes web/API : HTTP 200, corps `{"status":"ok"}`. Accueil français rendu
  dans le navigateur. Ces mesures prouvent la disponibilité observée, pas la
  présence du nouveau correctif dans les images tant que le rollout n'est pas attesté.
- `/upgrade?interval=annual` redirige vers la connexion dans cette session.
  Aucun paiement réel effectué. Parcours connecté et responsive du paiement
  non attestés ; la fiche du bug reste ouverte sur la colonne « Testé live ».

## Validation des propositions : correctif fusionné

#685 traite la course d'enregistrement des contrôles, les deux contrôles CodeQL,
les erreurs ignorées et les permissions excessives du jeton. Six contrôles Node
et le garde de pinning passent localement. Le nom `.checks.mjs` distingue la suite
Node de la découverte Vitest, sans retirer son exécution obligatoire. CI, les
quatre tranches E2E et leur agrégateur, sécurité, qualité et validation PR ont
réussi sur le head `50b9ab2b480001134332c239a4f4fac91f7cc885`. Fusion sur main
`01b72f6a5c5fe7a1b783dc27730f092922196c6e` ; aucune porte contournée.
Le run de livraison `37890108592` s'est ensuite arrêté à la porte des contrôles
de ce SHA : l'agrégateur E2E `37890108457` a refusé deux échecs non exemptés,
palette et envoi d'une réparation vers l'Agent. Les quatre jobs de tranche
étaient verts, ce qui ne signifie pas que tous leurs tests l'étaient : seul le
verdict de l'agrégateur atteste l'ensemble. Aucune image construite par ce run.
Les erreurs terminales, les erreurs API et les contrôles jamais enregistrés
restent bloquants. La livraison automatique de ce nouveau main n'est pas encore
attestée.

## Contribution de Claude intégrée

#651 fusionnée sur main `243c315f98a541d9860efe2dd7e7bcbf776d0d4c` après
réussite de CI, E2E, sécurité, qualité, validation PR, desktop et audit français
du head `6b23b962f6699ea239199319335c12f78ec45e94`. Le nom générique de la
formule gratuite est harmonisé entre billing et upgrade, sans renommer les
produits ni supprimer la protection annuelle. Sa livraison et sa vérification
connectée en production ne sont pas encore attestées.

## Prochaine preuve nécessaire : résultat du scan bloquant

#687 conserve désormais chaque rapport CRITICAL JSON dans l'artefact envoyé
avec `always()`. Les remarques de revue sont traitées dans le head `6b1b5ec` :
source TypeScript strict et bundle reproductible, poursuite de collecte après
erreur scanner, rapport absent ou malformé. Les sept contrôles exécutent le shell
réel avec un scanner de test ; tous réussissent. Retirer `--exit-code 1` produit
deux échecs. Seuil,
exceptions par image et refus de livraison inchangés. Les six workflows du head
`6b1b5ecfe390e15dfd1236a0576f522b585e6e1d` ont réussi, agrégateur E2E inclus.
#687 est fusionnée sur main `bc263f1bf4cbb63d9fb17bf0992d6856da9d4cb0` ;
livraison `37929994324` en attente des portes à la collecte. Elle ne répare ni
ne masque une vulnérabilité inconnue et sa présence en production n'est pas
encore attestée.
Un téléchargement local de Trivy a retourné un fichier vide et a été rejeté
par SHA256 avant exécution. Aucun accès opérateur au cluster n'a été employé.

#688 attend une conversation réellement persistée avant les actions palette
et réparation. La palette repasse aussi sur le head de #687 sans correctif
produit : la cause d'hydratation reste une hypothèse. #689 corrige séparément la
perte de diagnostics entre deux invocations Playwright : trois gardes locales
vertes, dont deux rouges et un diagnostic effectivement supprimé avec les
anciens paramètres. Ces deux propositions attendent leur CI et leur fusion ;
aucune action pendant la coque provisoire ni aucun parcours client live n'est
déclaré validé.

Le lancement global reste non validé : catalogue Stripe/devise/abonnements,
parcours client complet, isolation réseau effective, restauration, capacité et
surfaces promises restent soumis à leurs propres preuves.
