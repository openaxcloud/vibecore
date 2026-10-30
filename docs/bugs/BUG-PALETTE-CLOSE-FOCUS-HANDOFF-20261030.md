---
id: BUG-PALETTE-CLOSE-FOCUS-HANDOFF-20261030
---

# Reçu de focus consommé avant le remplacement de coque

📤 Dispatché : ☑ ; 💻 Codé sur main : ☐ ; ✅ Testé live production : ☐.

Sur main `bd5e0f5ea`, le vrai hook `useCommandPaletteReturnFocus` vide sa référence partagée avant la frame de restauration. Si la coque fermée est remplacée avant cette frame, le cleanup annule la frame et la nouvelle coque ne reçoit plus de cible. Un test isolé et une recette compilée qui impose cet ordre reproduisent le focus sur BODY ; le contrôle sans remplacement restaure le bouton.

Le parcours exact du test CI 1440, qui attend le premier remplacement avant fermeture, passe localement normalement et avec CPU ×4. La cause de son retry reste donc inconnue : la course reproduite est distincte, pas une explication certifiée du journal CI.

Le correctif local conserve le reçu jusqu'à sa tentative effective, sans restaurer un focus appartenant à un autre projet/fenêtre, sans voler une nouvelle cible extérieure et sans action différée lors d'une réouverture. Implémentation et contre-épreuves locales finales validées ; CI à venir. Aucun clic ni Entrée ne doit être rejoué.

Toutes les recettes sont locales avec fixtures synthétiques. Aucun accès ou changement de projet client, fournisseur IA, secret ou déploiement.

## Validation locale finale

Unitaire : 4 échecs / 25 réussites avant correction, 29/29 après. Recette compilée : **7/7 sans reprise**, course forcée dans trois contextes indépendants, ordre ordinaire CPU1/CPU4, cible extérieure avant frame et réouverture avant frame. Les deux parcours ordinaires baseline restent 2/2 verts : la cause du retry CI1440 n’est toujours pas établie.

Parent : 65 tests ciblés, typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants et typage E2E verts ; revue indépendante 46 tests favorable. Comptes recouvrants à ne pas additionner. Pas d’E2E complet backend réel local exécuté. Correctif local non publié ni intégré, aucune validation production.

Les scripts s’arrêtent après leurs assertions ciblées ; Database/navigation après `continue` non exécutés. Les captures corrigées sont avant fermeture : le retour du focus est établi par les assertions et le ledger, pas par une capture après fermeture. Les premiers essais avant disponibilité du serveur (connexion refusée) restent archivés comme erreurs de préparation.

[Scripts, reçus, captures et manifeste](ui-menu-handoff-evidence-20261030/README.md). Pas de cause commune présumée avec le gap mobile, de clôture #834 ou de certification Safari physique/31panneaux.
