---
id: BUG-PROJECT-EXPLICIT-BUDGET-EXTENSION-20261101
section: "Agent et budget"
---

# Extension bornée d'une enveloppe de recette par projet

## 📤 Dispatché

☑ 01/11 — préparer une extension autorisée de 10,52 USD, de 20 à 30,52 USD,
pour un seul projet de recette et un seul run supplémentaire.

## 💻 Codé

☐ — branche isolée en préparation ; aucune livraison ni mutation de l'enveloppe réelle.

## ✅ Testé live

☐ — aucun run fournisseur ni activation production exécuté par ce chantier.

## Contrat

Le plafond par permis et le calcul conservateur des appels restent inchangés.
L'extension est une opération administrative ciblée, réauthentifiée et auditée.
Elle conserve les anciens permis, identifiants et réservations ; elle n'est ni
un remboursement, ni un rechargement de crédits fournisseur. Les autres projets
restent plafonnés à 20 USD.

Une extension persistante, liée au projet et à l'instantané exact du ledger,
permet au plus un nouveau run, une réservation de 15,26 USD et deux appels.
La version de carte active est vérifiée ; tout montant supérieur, autre modèle
ou fournisseur, divergence de l'instantané ou nouvel élargissement est refusé.
Les réservations restent conservées après l'essai, même sans coût facturé connu.

La lecture du solde ne crée aucune réservation. Elle accepte uniquement les
plafonds connus (20 ou 30,52 USD), vérifie leur arithmétique et conserve
l'indication que les coûts historiques Auto/fournisseur ne sont pas inclus.

## Exploitation

Lire la proposition administrative sans réserver. Vérifier l'identité du projet,
l'organisation, le ledger et la carte active. Appliquer uniquement le montant
autorisé avec une réauthentification administrateur existante. Relire ensuite
le solde avant l'unique essai explicite Lite/Luna réalisé par le coordinateur.
Ne jamais modifier le ledger brut via les paramètres système, libérer les
réservations historiques ou relever le plafond global pour contourner un refus.

### Activation après livraison vérifiée

Aucune extension ne s’applique au déploiement. Avec une session administrateur
existante, utiliser l’API administrative habituelle (aucun jeton dans un journal) :

1. Lire `GET /admin/projects/cmvrzkkmo008z0nemon1zdd3k/explicit-budget-extension`.
   Vérifier le projet, `organizationSlug: org-dzj1djmz`, `eligible: true`,
   `grantApplied: false`, et le solde 20 / 15,26 / 4,74 USD.
2. Vérifier le permis proposé : OpenAI, `gpt-5.6-luna`, tier `default`, au plus
   deux appels et 15 260 000 micros réservés. La version de carte est celle lue
   dans l’API ; le seed du dépôt ne prouve pas la carte production.
3. Réauthentifier l’administrateur par le parcours existant `/auth/reauth`
   (validité cinq minutes), puis envoyer **exactement** l’objet `proposal` reçu
   au `POST` du même chemin. Il contient l’identifiant d’approbation fixe,
   les anciens runIds, la version de carte et le SHA-256 du ledger complet.
   Ne pas reconstruire les valeurs, modifier le ledger brut ou contourner un refus.
4. Exiger une réponse 200 puis relire le solde : plafond 30,52 USD,
   réservés 15,26 USD, restant 15,26 USD, `grantApplied: true`.
   En cas de résultat réseau incertain, relire avant toute action ; le payload
   initial exact est idempotent pour le même administrateur et la même approbation.
5. Le coordinateur seul réalise ensuite l’unique recette Lite/Luna explicite.
   Une réservation maximale porte le total à 30,52 USD et le restant à zéro.
   Même si une carte moins chère laisse un reliquat, aucun troisième run n’est admis.

Ce mécanisme ne fournit pas de nouvelle interface de crédit ni de nouvelle
permission. Sans session plateforme administrateur et réauthentification valide,
l’activation reste bloquée. Une réponse 409 signifie qu’il faut examiner la
concurrence, le périmètre ou la carte ; elle n’autorise aucune augmentation.

### Preuves isolées

Tests domaine : 15 cas ciblés, 239 cas billing. API assemblée : 36 cas ;
régression transcript : trois cas. PostgreSQL réel local jetable : six cas,
zéro skip, deux connexions concurrentes distinctes, une extension, un audit,
un seul run additionnel, anciens permis inchangés ; transfert d’organisation
refusé. Une contre-exécution indépendante confirme ces six cas sur main assemblé.
Les fixtures utilisent des utilisateurs et données synthétiques, aucun fournisseur.
Les tests de lecture UI vérifient 30,52 / 15,26 et 30,52 / zéro, les plafonds
inconnus refusés et l’absence d’écriture depuis la route de lecture.

Ces preuves ne démontrent ni une activation réelle, ni un paiement fournisseur,
ni une génération réussie. Les réservations historiques ne sont jamais libérées.
L'absence de session administrateur dans l'environnement de développement ne
permet pas d'affirmer la carte ou les permissions réellement actives en production.
