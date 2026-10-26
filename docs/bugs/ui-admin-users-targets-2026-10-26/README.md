# AdminUsers : diagnostic statique et preuves existantes uniquement

Aucune source, aucun index, aucun commit modifié. Aucun navigateur, serveur, build ou test supplémentaire lancé. Base locale préservée 1e368df5c.32 PR ouvertes vérifiées avec pagination des listes longues : aucun changement de `app/routes/admin.$section.tsx` ni `app/components/ui/Dropdown.tsx` dans les PR ouvertes au relevé. Cela ne transfère pas la propriété des composants partagés.

## Mesures réellement disponibles

20 observations historiques `/admin/users` : FR/EN × clair/sombre ×320/390/844 paysage/820/1440. `existing-observations.json` est un extrait du reçu before13199, avec provenance et SHA256. Le harness d’origine ne relevait que texte et hauteur : ni largeur, ni disabled, ni coordonnées des voisins, ni zone de hit-test. Les mesures ne démontrent donc pas une collision ou une violation WCAG automatique.

| Contrôle | Hauteur mesurée | État déduit de la source et de la fixture | Emplacement |
|---|---|---|---|
| Tri Utilisateur/E-mail | 14,188–15,609 px | Boutons sans disabled ; activent un changement de query GET | UsersPanel.sortableHeader, admin.$section.tsx2624 |
| Tri Création | 17,031–19,875 px | Idem ; flèche de tri incluse | Même fonction |
| Menu de ligne ⋯ | 21–24,5 px | disabled seulement si fetcher busy ; initialement idle attendu, non relevé dans le reçu | UserRow, admin.$section.tsx2755 |
| Précédent/Suivant | 25,031–28,875 px | Les deux désactivés dans cette fixture : 1 utilisateur, total implicite1, page1, pageSize50 | UsersPanel, admin.$section.tsx2690/2698 |

Ainsi, les trois tris et le déclencheur de menu sont des cibles potentiellement utilisables nettement sous la convention locale44px ; leur activation effective n’a pas été testée dans cette matrice. La pagination active n’est pas prouvée par ces données : il faut une fixture paginée GET pour l’évaluer, sans requalifier les boutons désactivés en défaut d’utilisation.

## Espacement et cible complète

Le tri est un vrai `<button>` ; le padding `px-4 py-3` du `<th>` parent ne porte aucun onClick et n’agrandit pas sa cible. Le menu Radix utilise Trigger asChild : le bouton local h-7 w-8 est la cible, sans enveloppe interactive agrandie. La table reste volontairement min-width680 avec scroll horizontal ; une cible hors du viewport initial n’est pas à elle seule un clipping.

La pagination possède un gap-2 dans son span. Les cellules ont leur padding local ; ces valeurs source ne remplacent pas une mesure des distances et du hit-test. Aucune proximité dangereuse ni absence d’espace suffisant n’est affirmée.44px est la convention demandée pour cette mission, pas une affirmation automatique de non-conformité WCAG.

## Propriété et périmètre minimal proposé

Le fichier `admin.$section.tsx` contient aussi des imports paresseux @settings (Debug, TaskManager, ServiceStatus, EventLogs, CloudProviders, LocalProviders) réservés à coordination IDE/ops. Ne pas modifier ces imports, sections ou actions.

Un futur delta peut rester dans les deux fonctions locales UsersPanel/UserRow : minima de hauteur44px sur les trois boutons de tri, largeur/hauteur44px sur le déclencheur ⋯. Conserver handlers, aria-sort, disabled, password/step-up, menu et actions. Ne pas modifier Dropdown.tsx, son portail, focus, items ou les styles globaux. La pagination peut attendre une preuve avec page intermédiaire active ; une extension ciblée serait dans ces deux boutons locaux seulement.

Avant application : contrepreuve navigateur synthétique mesurant hauteur ET largeur, disabled et distances, Tab/Enter tri GET, ouverture du menu/Escape/retour focus sans sélectionner aucune action ; scroll horizontal jusqu’au menu. Aucun mot de passe réel, POST, rôle, suspension, impersonation ou accès créé. Vérifier ensuite la grille/table et la pagination sur fixture paginée avant d’élargir. Aucun patch préparé ni appliqué à ce stade.

## Contrepreuve ciblée et correction locale ultérieures

Après autorisation, branche/worktree isolé `admin-users-next` depuis `1e368df5c`. Le build c340 existant est servi en lecture seule ; provenance dans browser/server-origin.json. API isolée 7299, serveur14499, deux utilisateurs synthétiques, GET uniquement. Les marqueurs de session sont strictement locaux, sans accès persistant.

`browser/receipt.json` : 16 contextes (320/390/820/1440 × FR/EN × thèmes demandés), 64 cibles actives avant/après DOM. Trois boutons de tri et le menu du premier utilisateur : disabled false et centre réellement atteignable par elementFromPoint. Après minimum44px en largeur/hauteur, les64cibles satisfont les bornes44 et le hit-test central.16 parcours tri par GET, menu par Entrée, Escape et retour du focus réussissent ; aucun item administratif sélectionné. Les captures FR clair320/1440 distinguent avant et contrepreuve. Le thème demandé est fourni par cookies, mais le reçu ne relève pas explicitement le thème calculé ; les captures ciblées ne constituent pas une preuve indépendante de tous les modes.

La première mesure auxiliaire de proximité comptait un backdrop non interactif de la page : ses valeurs nearest sont exclues. `browser/spacing-receipt.json` refait uniquement la mesure dans la même table avec exclusion pointer-events:none, sur les16contextes. Distance minimale entre rectangles actifs :19px avant comme après. Cela ne prouve pas toutes les exceptions WCAG ; aucune collision n’est affirmée. Les dimensions et parcours du reçu principal restent valides.

Correction source : uniquement ajouter `!min-h-[44px] !min-w-[44px]` aux classes de sortableHeader et UserRow.trigger dans admin.$section.tsx. `source-preservation.json` prouve que retirer ces deux ajouts redonne exactement le fichier base : handlers, disabled, permissions, actions, Dropdown et tout le bloc @settings inchangés. Aucun changement de pagination désactivée ni ajout de test miroir CSS.

Dix tests existants admin.$section passent ; lint et Prettier ciblés réussissent. Revue indépendante final_review favorable sur le périmètre et les classes. Réserve obligatoire après build : mesurer les zones internes44, tableau/scroll horizontal, contenu et menu dans le viewport, Escape/focus sur la vraie source compilée. Les preuves après actuelles sont DOM, pas compilation du correctif.

Tous les navigateurs sont fermés. browser/cleanup.json confirme l’arrêt des seuls PID218791/218790 après vérification PID/startTicks/cmdline ; états Z sans RSS et ports refusés sont distingués. Aucun nouveau build, index ou push. Main/live restent faux. Logs copiés avec fins de lignes normalisées et espaces finaux retirés.
