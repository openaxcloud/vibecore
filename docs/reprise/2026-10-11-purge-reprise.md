# A-6 — reprise de la purge physique de compte

| Préparation | Sur main | Testé en production |
|---|---|---|
| Code repris, preuves locales rejouées | Non | Non |

## Fusion réelle

Reprise de `vague3-purge47-hardening` sur main `408e9f84` dans un arbre isolé.
Quatre conflits de clients générés sont résolus par régénération Prisma 7.8.0.
Le catalogue conserve le refus de scope stockage déjà livré et ajoute le refus
de stockage gelé. Le gestionnaire garde la dérivation des secrets par espace et
la détection d’un pod existant, avec la barrière de purge immédiatement avant
chaque création Kubernetes. Aucun ancien secret racine n’est remis dans un pod.

La fixture d’URL de téléversement est mise au contrat actuel (`maxBytes`). Les
membres privés ajoutés suivent les conventions du dépôt. Les preuves historiques
de juillet et août sont conservées ; elles ne sont pas présentées comme une
mesure de production du 11 octobre.

## Mesures du 11 octobre

PostgreSQL 16.10 isolé, pgvector 0.8.0, image
`sha256:a132765ec351c65111b5b675928a3a0515a466a40f97277329db8b8209ad8bc9`.
Toutes les migrations du dépôt et de cette branche se sont appliquées à neuf.
L’essai initial PostgreSQL sans pgvector a échoué avant les tests ; il ne vaut
pas preuve de migration.

- API : 95 tests dans cinq suites, dont 29 contre PostgreSQL réel. Concurrence de
  deux workers, plan unique par sujet, renouvellement de lease, réconciliation
  d’un plan abandonné, gel partagé entre plans, preuve et tombstone atomiques,
  refus de retrait de la file sans reçu, conservation des données financières.
- Gestionnaire : 97 tests de routes et de cycle de vie. Les protections de secret
  existantes sont conservées ; le gel bloque les créations et les jetons.
- 19 tests supplémentaires de CAS et leases sur PostgreSQL réel, avec connexions
  distinctes et contre-cas d’une base indisponible. Aucun skip n’est compté dans
  ces 19 succès.
- Worker : dix tests de réconciliation authentifiée, dont erreurs de réseau et
  absence de secret.
- Contre-épreuve : retirer seulement les deux validations de lease juste avant
  les suppressions physiques produit deux échecs et neuf succès. Correction
  restaurée : la suite repasse dans les 95 tests API.
- Types et builds API, gestionnaire et worker exécutés. Lint des nouveaux modules
  API et preuves : zéro erreur, trois avertissements de fournisseurs e-mail
  volontairement inertes dans les tests. Comparaison des grands fichiers avec
  main : zéro nouvelle erreur ; erreurs préexistantes conservées. La sortie
  Prisma contient ses espaces de génération, sans retouche manuelle.

## Réserves de livraison

Le job planifié ne transmet aucun `enabled=true` ; la route reste en simulation
par défaut sauf drapeau ou requête interne explicite. Aucun drapeau de purge
n’est activé par cette reprise. Aucune donnée cliente n’a été supprimée.

Les comptes PostgreSQL sont exclusivement des fixtures locales. Les ports GCS
et Kubernetes sont testés avec des dépendances pilotées ; la disparition récente
d’un vrai bucket et d’un vrai PVC n’est pas rejouée, faute de connexion de test.
Les quatre réserves expertes demeurent ouvertes pour la livraison : barrière
réelle, absence réelle, périmètre complet du sujet et preuve d’effacement externe.
A-6 ne passe pas au vert et l’activation automatique reste différée.
