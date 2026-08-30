# CHARTE-IDE-001 — l'accent de l'IDE passe du bleu à l'orange de marque

## Le constat

L'IDE peignait ses actions en **bleu** (`--vc-ide-accent-action` : `#006fd6` en
clair, `#0099ff` en sombre) alors que toute la surface publique et
l'authentification utilisent l'**orange E-Code** (`--vc-public-accent`,
`--vc-auth-accent`). Deux accents concurrents coexistaient jusque dans un même
écran : chips et badges bleus, mais sous-onglet actif souligné en orange.

## Pourquoi ce n'est pas un simple échange de valeur

Mesures faites sur les surfaces réelles de l'IDE :

| Couleur | Aplat + texte blanc | Aplat + texte `#1a1a1a` | En texte sur blanc | En texte sur `#0e1525` |
|---|---:|---:|---:|---:|
| `#f26207` (marque) | 3,22 ✗ | 5,41 ✓ | 3,22 ✗ | 5,66 ✓ |
| `#f97316` (orange vif) | 2,80 ✗ | 6,21 ✓ | 2,80 ✗ | 6,50 ✓ |
| `#c2410c` (orange foncé) | 5,18 ✓ | 3,36 ✗ | 5,18 ✓ | 3,52 ✗ |
| `#006fd6` (bleu sortant) | 4,95 ✓ | 3,52 ✗ | 4,95 ✓ | 3,68 ✗ |

Aucune valeur ne passe partout. La solution retenue est celle que le produit
applique **déjà** ailleurs (`--vc-auth-accent`, `--vc-public-accent`) : orange
foncé en clair, orange vif en sombre, avec une couleur de texte dédiée pour les
aplats — le token `--vc-ide-text-on-accent`, qui existait déjà mais valait
`#ffffff` dans les trois thèmes.

- **clair** : aplat `#c2410c` + texte `#ffffff` → **5,18:1**
- **sombre** : aplat `#f97316` + texte `#1a1a1a` → **6,21:1** ; en texte sur
  `#0e1525` → **6,50:1**

## Résultat mesuré (6 panneaux × 2 thèmes, même méthode avant et après)

| | Éléments accent mesurés | Échecs AA |
|---|---:|---:|
| **Avant** (bleu) | 83 | **28** |
| **Après** (orange + paire de tokens) | 82 | **0** |

Le passage à la charte **corrige 28 échecs d'accessibilité préexistants** : en
thème sombre, le bleu `#0099ff` portait déjà du texte blanc à 3:1, et le bouton
« Enregistrer les paramètres » était à 2,83:1.

⚠️ Piège de mesure, corrigé en cours de route : un fond translucide (bouton
« fantôme » = accent à 9 % d'opacité) doit être **composé sur ce qui est peint
dessous** avant tout calcul. Sans ça, on compare l'accent contre lui-même et on
obtient de faux échecs à 1,2:1. La garde E2E documente et applique cette règle.

## Captures

| Fichier | Thème | État |
|---|---|---|
| `accent-avant-light.png` | clair | avant |
| `accent-apres-light.png` | clair | après |
| `accent-avant-dark.png` | sombre | avant |
| `accent-apres-dark.png` | sombre | après |

Panneau Paquets, 1280×820, pile locale de la branche.

## Garde

`tests/e2e/ide-accent-contrast.spec.ts` rejoue la mesure sur deux panneaux et
les deux thèmes, et échoue si un seul texte accent passe sous AA.
