# Recensement des couleurs d'action — 792 usages triés en trois familles

Reproductible : `node scripts/audit/recensement-couleurs-action.mjs` (lecture seule,
scanne `app/`). Jetons suivis : `--vc-ide-accent-action`, `--vc-action-primary`,
`--vc-cta-accent`.

## Décompte par famille

| Famille | Usages | Traitement |
|---|---:|---|
| **Action primaire** — aplat accent (fond plein) | **131** | Prend l'orange de marque, avec sa couleur de texte dédiée |
| **Sémantique** — texte, icône, bordure, anneau de focus, teinte | **541** | **Ne pas toucher** : porte du sens |
| Définitions de jetons (ne peignent rien) | 57 | Point d'entrée du changement |
| Ambigu — à trancher à la main | 63 | Voir plus bas |

Les 63 « ambigus » sont, à l'inspection, très majoritairement des **commentaires
et des assertions de tests** qui citent le nom du jeton sans peindre quoi que ce
soit. Aucun n'a été modifié : ils sont signalés, pas tranchés au jugé.

## Action secondaire : c'est là qu'est l'incohérence

La règle demandée est « une seule déclinaison secondaire ». Aujourd'hui, sur des
éléments cliquables, **14 déclinaisons de fond neutre coexistent** :

| Usages | Classe de fond |
|---:|---|
| 27 | `bg-bolt-elements-button-primary-background` |
| 22 | `bg-bolt-elements-button-primary-backgroundHover` |
| 6 | `bg-bolt-elements-button-secondary-background` |
| 6 | `bg-bolt-elements-button-secondary-backgroundHover` |
| 4 | `bg-bolt-elements-button-danger-background` |
| 3 | `bg-white` |
| 2 | `bg-bolt-elements-sidebar-buttonBackgroundDefault` |
| 2 | `bg-bolt-elements-button-primary` |
| 2 | `bg-bolt-elements-item-backgroundAccent` |
| 2 | `bg-bolt-elements-background-depth-*` |
| 1 | `bg-transparent`, `bg-bolt-elements-preview-addressBar-background`, … |

**Le piège de nommage** : `button-primary-background` est la déclinaison la plus
utilisée (27), mais c'est un **fond teinté discret**, pas l'action primaire de la
charte. Un développeur qui cherche « le bouton principal » tombe dessus et
obtient un bouton secondaire. C'est cette confusion — plus que la teinte — qui
produit le mélange gris/bleu constaté à l'écran.

## Ce que ce recensement ne fait pas

Il **ne repeint rien**. L'unification de la famille secondaire est portée par
[#254](https://github.com/openaxcloud/vibecore/pull/254), qui corrige le cycle de
dérivation entre `--vc-action-primary` et `--vc-ide-accent-action`. Ce document
lui fournit la cartographie et le décompte ; il ne prend pas la main dessus.

## Limite de méthode

Le classement est fait **ligne par ligne**, sur le texte source. Une ligne qui
pose un fond et une couleur de texte dans la même déclaration est comptée comme
« action primaire ». Un usage réparti sur plusieurs lignes peut être classé
« ambigu ». Le décompte est donc un ordre de grandeur fiable, pas un inventaire
au caractère près — et c'est pour ça que la colonne « ambigu » est publiée plutôt
que rangée sous le tapis.
