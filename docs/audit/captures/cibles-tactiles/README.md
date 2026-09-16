# TACTILE-001 — cibles tactiles de la coque compacte (390 ET 768)

Décision d'Avi : **« pour tablet ce doit être comme mobile »**. La coque compacte
s'applique sous 1200px : les deux largeurs sont traitées par les mêmes règles,
jamais la tablette comme un desktop rétréci.

## Mesuré (4 panneaux × {390, 768}, contrôles interactifs distincts)

| | Contrôles sous 44px |
|---|---:|
| **Avant** | **49** (socle 5, contenu 44) |
| **Après** | **0** |

Détail de ce qui était trop petit :

| Contrôle | Avant | Après |
|---|---:|---:|
| « Retour au tableau de bord », « Activité », « Ouvrir les outils », « Plus d'options » | 36×36 | 44×44 |
| Déclencheur de recherche de l'en-tête | 202×20 (390) / 580×20 (768) | ≥44 de haut |
| Contenu de panneau (21 contrôles : boutons, champs, sélecteurs) | 42 | 44 |
| Chips de démarrage de l'agent | 38 | 44 |
| Puces de mode du composer (Léger/Économique/Puissance) | 52×25 | ≥44 |
| « Avancé », « Planifier », sélecteur de mode | 28-32 de haut | ≥44 |
| Pièce jointe, micro, « plus » du composer | 30×30 | 44×44 |

## Le correctif

Un jeton unique, `--vc-touch-min: 44px`, remplace les valeurs codées en dur (36,
38, 40, 42, 30). Les règles concernées vivent toutes dans la portée compacte,
donc **le desktop n'est pas touché** — sa densité reste celle voulue.

Deux pièges rencontrés, corrigés et documentés dans le code :

1. **`:where()` n'apporte aucune spécificité.** La première version de la règle
   faisait jeu égal avec les utilitaires (`min-h-7`) qui, déclarés plus loin,
   l'emportaient : « Avancé » passait bien à 44px (sa taille venait de `height`)
   mais les puces de mode restaient à 25px. Corrigé en `:is()`.
2. **La barre d'outils du composer était explicitement rétrécie à `30px
   !important` DANS la portée compacte** (`@media (max-width: 1199px)`),
   c'est-à-dire au doigt, là où la cible doit être la plus généreuse. Sa hauteur
   fixe de 36px écrasait par ailleurs toute cible plus grande.

## Captures

`cibles-avant-390.png`, `cibles-apres-390.png`, `cibles-avant-768.png`,
`cibles-apres-768.png` — panneau Activité, pile locale de la branche.

## Garde

`tests/e2e/ide-touch-targets.spec.ts` mesure les deux largeurs et échoue si un
seul contrôle passe sous 44px. Il refuse aussi de passer à vide : si le balayage
ne voit aucun contrôle, il échoue plutôt que de vous rassurer à tort.
