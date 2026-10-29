---
id: BUG-MOBILE-MODAL-KEYBOARD-CONTAINMENT-20261029
---

# Le clavier sort des feuilles mobiles déclarées modales

## État

📤 Dispatché : ☑ diagnostic local depuis main `fe7909242`.
💻 Codé : ☐ correctif local validé, non publié ni intégré.
✅ Testé live : ☐ aucune recette de production.

## Reproduction

À 390 px, Panneaux, Outils et Onglets déclarent `aria-modal=true`, mais l’ouverture laisse le focus sur BODY. La première tabulation atteint un contrôle derrière la feuille. Depuis les limites de chaque dialogue, Maj+Tab atteint le backdrop ou le dock ; Tab quitte vers BODY. Échap ferme déjà correctement et restitue le focus. Trois témoins compilés par parcours, API et fichiers synthétiques, aucun projet client.

Le correctif local confine l’entrée et les tabulations à ces trois dialogues seulement. Il préserve le focus et la sélection restaurés lors du remplacement de coque, laisse les événements consommés et les dialogues enfants à leur propriétaire, et conserve la fermeture/restauration existante. La tabulation utilise le défilement natif du focus pour rendre les contrôles visibles.

## Validation et limites

Recette compilée : **5/5 formats et15 dialogues** à 390×844,820×900,1180×757,844×390 et 390×320. Entrée naturelle, premier Tab, confinement Tab/Maj+Tab, visibilité et hit-test des contrôles extrêmes, Escape et restitution du focus passent. Un témoin supplémentaire de remplacement de coque conserve query et focus (**1/1**).

Validation globale parent :59 tests (43 UI+16 inventaire), typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants, i18n et typage E2E verts. Revue indépendante modales18 tests et lecture statique E2E ; pas d’E2E complet backend réel local, CI encore à exécuter. Résultats synthétiques locaux, non publiés et non validés en production.

Incident distinct ouvert : Entrée peut arriver sur BODY pendant le montage d’une coque dont le nouveau chrome mobile n’existe pas encore. Aucune activation différée n’est rejouée par ce correctif. Les témoins de redimensionnement passent 4/4 avec 16 navigations au pointeur ; Search/navigation interrompue passent 4/4 à 390/768. Cela ne clôt pas les anciens incidents intermittents ni #834.

Preuves : [archive et manifeste](ui-responsive-recovery-evidence-20261029/README.md). Pas de Safari physique, backend réel ou certification des 31 panneaux.
