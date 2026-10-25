---
id: BUG-INTEGRATIONS-SYNC-FALSE-SUCCESS-001
section: "Intégrations — contrat fonctionnel"
---

## Bug

Le panneau Intégrations présente une synchronisation réussie sans opération fournisseur. Sur `e40edf3e04217e2d0e96ea1385c0420e18374bac`, le POST `intent=sync` lit `VIBECORE_INTEGRATIONS_STATE`, écrit `connected=true`, `status=active`, `lastSync=now`, puis renvoie `ok=true`. Le POST `connect` fabrique également `lastSync`. Le panneau affiche ces dates comme historique de synchronisation.

La recherche des consommateurs de cette clé dans `app`, `services` et `packages` ne trouve pas d’exécuteur de synchronisation associé. Les providers OAuth/API-key ont des contrats d’authentification et d’identité distincts ; leur existence ne prouve pas ce bouton Sync.

## 📤 Dispatché

Oui — tranche bornée du 20 octobre 2026, branche `codex/integration-sync-honesty-20261020`.

## 💻 Codé

Correctif présent sur main `941d7d7fc`, vérifié le 25 octobre 2026 (commit `c98845221`) : le POST garde la lecture autorisée du projet, puis refuse `503 INTEGRATION_SYNC_UNAVAILABLE` sans écrire l’état ni les secrets. Le GET expose une capacité `available=false`. Les boutons Sync restent désactivés avec explication EN/FR ; l’historique enregistré est qualifié « non vérifié », sans migration ni réécriture. Connect ne génère plus de date de synchronisation.

## ✅ Testé live

Non. Aucun fournisseur, OAuth réel, paiement, secret ou donnée client touché. Aucun nouveau connecteur implémenté. Pas de preuve de production ou de Safari réel.

## Preuves locales

- Vrai handler BFF + vrai `apiRequest` vers serveur HTTP loopback explicitement simulé : avant correction, 8 échecs attendus et 2 témoins verts ; aucune API fournisseur contactée.
- Composant privé réel extrait par AST, dépendance de carte d’authentification remplacée par une fixture explicite : avant correction, 6 échecs EN/FR (bouton actif, date affichée comme vérifiée).
- Résultats après correction et commandes consignés dans le relevé de validation du lot ; ne pas confondre tests locaux et service livré.

## Validation du candidat, 20 octobre

[Relevé structuré des sources et preuves locales](../reprise/mesures/2026-10-20-integration-honesty-local.json) : 96 tests ciblés sur sept fichiers, zéro échec, un worker ; lint ciblé zéro diagnostic sur quatre sources produit et trois specs ; build standard `pnpm run build` terminé avec code 0. Le typecheck/lint globaux du hook sont des contrôles séparés, non déduits de ces tests.

Recette réelle locale sur web compilé, API et PostgreSQL, avec identité/projet QA synthétiques propres : EN 1440, FR 820 et FR 390. Configuration relue puis retrouvée après reload, Sync désactivé et POST503 sans mutation, création par formulaire d’une configuration webhook sans taux inventé. Toutes les destinations navigateur non-loopback sont bloquées ; aucun transport ni fournisseur testé. Projet supprimé avec réponse 200, aucun processus actif possédé restant ; l’identité QA créée est conservée explicitement. Le build utilise le mode WebContainer par défaut et aucune commande runtime n’est lancée. La première tentative a échoué sur un sélecteur mobile utilisé sur desktop, corrigé sans changer produit, délai ou assertion. Six captures ciblées après scroll réel ont ensuite été inspectées sur les trois formats : messages et boutons lisibles, aucune valeur secrète ni donnée client. Ce second projet QA a aussi été supprimé avec réponse 200 ; zéro processus actif ou zombie possédé restant.

## Limites distinctes

Le stockage/configuration présenté comme connexion active ne démontre pas encore une connexion fournisseur. Les autres fonctions du hub restent à éprouver : webhooks, clés et flux. Le faux `successRate=100` est traité dans le même lot, avec une fiche distincte `BUG-INTEGRATIONS-WEBHOOK-UNMEASURED-001` : supprimer la métrique inventée ne prouve aucune livraison webhook.
