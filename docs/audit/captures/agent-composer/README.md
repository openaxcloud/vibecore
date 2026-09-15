# Composer Agent — compaction (demande d'Avi : « zone de saisie compacte type Claude »)

Mesuré sur pile locale, viewport 1280×820, panneau Agent de 752 px de haut,
captures prises dans des conditions **identiques** avant et après.

| Mesure | Avant | Après | Gain |
|---|---:|---:|---:|
| Bloc composer | **351 px** | **312 px** | −39 px |
| Zone de saisie au repos | **92 px** | **50 px** | −46 % |
| Groupe de modes (puces) | 26 px | 26 px | — |
| Ligne d'aide du mode | 17 px visibles | 0 (accessible) | −17 px |

## Ce qui a changé

1. **50 px de rembourrage bas mort sous la zone de saisie.** Ils réservaient la
   place d'une barre d'outils *superposée* ; dans le composer de l'IDE, la barre
   est un **frère rendu en dessous**. Ces 50 px n'étaient qu'un vide entre le
   texte et les icônes — visible sur la capture « avant » — et ils gonflaient la
   hauteur au repos calculée par l'auto-agrandissement (`scrollHeight`).
2. **Plancher du composer** 80 px → 56 px, **plancher de la saisie** 76 px → 44 px.
   L'auto-agrandissement est inchangé : vérifié en direct, 7 lignes de texte
   portent la saisie à 135 px et le plafond de 140 px tient.
3. **Puces de mode insécables** (`truncate`, 11 px) : dans un panneau étroit leurs
   libellés passaient à la ligne et le groupe faisait 60 px au lieu de 26.
   Effet de bord visible sur la capture : « Avancé » remonte sur la même ligne.
4. **Description du mode** (« Le juste équilibre. ») : elle mangeait une ligne
   pleine. Elle passe en `sr-only`, reste lue par les lecteurs d'écran via
   `aria-describedby` et s'affiche au survol du groupe (`title`). Rien n'est perdu.

## Ce que je n'ai PAS fait, et pourquoi

Descendre vers ~140 px (le repère « type Claude ») demanderait de replier les
contrôles de mode derrière un menu compact, ou de déplacer « Planifier » dans la
barre d'outils du bas. Les deux contredisent des décisions écrites dans le code :

- `ChatBox.tsx` : « Always visible in the agent composer (IDE) — not hidden behind
  the collapsible model-settings — so the effort/cost controls are discoverable » ;
- « the Plan-first toggle sits directly beside the effort/Power control ».

Je ne renverse pas une décision produit documentée sans arbitrage. Les trois
lignes de contrôles restantes (puces+Avancé / prix / Planifier) coûtent ~100 px ;
si Avi veut les récupérer, la proposition est : prix affiché dans l'infobulle du
bouton « Avancé », et « Planifier » déplacé dans la barre d'outils du bas.
