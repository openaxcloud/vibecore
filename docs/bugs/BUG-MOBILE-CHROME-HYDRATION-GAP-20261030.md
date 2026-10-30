---
id: BUG-MOBILE-CHROME-HYDRATION-GAP-20261030
---

# Entrée perdue pendant un remplacement de coque mobile

📤 Dispatché : ☑ ; 💻 Codé sur main : ☐ ; ✅ Testé live production : ☐.

Sur main `bd5e0f5ea`, trois reproductions Chromium locales (Tools 390, Onglets 820 et 1180, CPU ×4) montrent le même mécanisme : le déclencheur focalisé disparaît, une nouvelle coque sans chrome mobile est montée, puis Entrée native cible BODY. La création ultérieure du bouton et la restauration du focus ne rouvrent pas le menu. Les trois témoins hors remplacement passent. Aucun événement n'est rejoué.

`BaseChat` réinitialise `clientHydrated` à false à chaque montage, puis le passe à true dans un effet. Le hook `useHydrated` déjà fourni par `remix-utils` conserve la parité SSR tout en exposant immédiatement les contrôles lors d'un remontage client. Le correctif local remplace seulement ce mécanisme ; il ne retarde ni ne rejoue une action utilisateur.

Le harness avec les vrais hooks de handoff confirme le premier commit, la restauration du focus, l'isolation projet/fenêtre et l'absence d'erreur récupérable SSR. La recette du build corrigé est terminée ; la CI reste à réaliser. Les tests utilisent des données synthétiques, pas Aster. Les témoins de navigation entre documents ne certifient pas encore une navigation SPA pendant le gap.

Les retries CI des menus ne sont pas tous causalement attribués à ce mécanisme. La palette desktop 1440 présente une observation différente de restitution du focus.

## Validation locale finale

Build corrigé : **9/9 activations directes** sur Tools390, Tabs820 et Tabs1180 (trois contextes indépendants par format), puis **3/3 stables**, **3/3 navigations vers un nouveau document** et **3/3 zoom natif200%**, sans reprise. Le snapshot de détachement exige le nouveau déclencheur présent et focalisé ; un seul Enter natif, aucune refocalisation ni délai élargi. Escape restitue le focus. Zoom CSS195×422/410×450/590×378, DPR2/CSSzoom1 ; ce témoin ne certifie pas toute la géométrie ni un clavier physique.

Le témoin produit sous ancienne readiness compte 1 échec / 3 ignorés, les quatre tests readiness réduits couvrent premier commit, scope et SSR. Parent : 65 tests ciblés, typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants et typage E2E verts ; revue indépendante 46 tests favorable. Ces suites se recouvrent, ne pas additionner leurs comptes. Pas d’E2E complet backend réel local exécuté : CI à venir.

Correctif local validé, non publié et non intégré sur main ; aucune validation production. Les témoins navigation changent de document, pas une interruption SPA pendant le gap. La causalité de tous les retries CI, le retry palette1440 et #834 restent ouverts. Pas de certification 31/31, Safari physique ou runtime réel.

[Scripts, reçus, captures et manifeste](ui-menu-handoff-evidence-20261030/README.md).
