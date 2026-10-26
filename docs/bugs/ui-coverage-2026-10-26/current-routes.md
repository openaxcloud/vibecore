# Couverture courante — complément à l’inventaire historique

L’inventaire à1714415cb reste inchangé. La base intégrée ea2ff01c5 est déclarée de même arbre par le parent ; les huit fichiers produit modifiés localement et leurs builds de recette forment une phase séparée. Aucun statut main/livraison n’est déduit ici.

| État par identifiant de route | Historique | Courant |
| --- | ---: | ---: |
| teste_local_partiel | 42 | 48 |
| non_exerce | 155 | 149 |
| reserve | 5 | 5 |
| hors_ui | 155 | 155 |

**357 IDs uniques ; six nouvelles routes partiellement exercées, donc42→48.** Cela ne signifie pas48 pages entièrement validées. Les151 unités de panneaux sont non additives ; la somme des cas de matrices ne produit aucun total de pages. [JSON exhaustif courant](current-routes.json) contient357lignes avec statut historique et `currentCoverageStatus`. [Inventaire historique](routes.md) conservé.

| Route nouvellement exercée | Groupes de preuves |
| --- | --- |
| `/account-inactivity` | account-inactivity10899, account-inactivity11099, scroll-regression11099 |
| `/docs` | public10899, docsSSR11099 |
| `/organization-security` | organization10599, header10999, scroll-security-switcher11099 |
| `/organization-siem` | organization10599 |
| `/organization-switcher` | organization10599, header10999, scroll-security-switcher11099 |
| `/templates` | public10899 |

## Phases et limites

### organization10599

48 observations :3routes×320/390/768/1440×FR/EN×clair/sombre;8 groupes, puis fermetures dialogue et scroll clavier SIEM. Ni création/sauvegarde, ni sécurité/SIEM réel ; ?create=1 sans ouvreur exclu du retour focus. Ces48 observations ne sont pas rejouées11099.

[Preuves et méthode](organization-after10599/README.md). Build/serveur :10599.

### header10999

8 simulations CDP FRclair :2routes×320×900,390×844,844×390,820×1180 ;32 observations header zéroinset sur8formats×FR/EN×thèmes. Simulations, pas matériel ; les32 observations de header ne sont pas32 recettes complètes par route. Reçu10899authentifié configuration erronée exclu.

[Preuves et méthode](safeareas/after10999/README.md). Build/serveur :10999.

### scroll-security-switcher11099

FRclair844×390 avec insetsgauche/droite47,bottom21 : Security molette/PageDown, brouillonfocusresize et récupération par molette ; dialogue Switcher contenu/Escape/focus. Champ Security x43<47 :4px dans marge sûre, reste ouvert. Header seul corrigé pour safeareas ; pas nouveau replay48géométries ni8simulations.

[Preuves et méthode](safeareas/after11099/README.md). Build/serveur :11099.

### public10899

88géométries :2routes×11formats×FR/EN×thèmes ;4zoomsnatifs200% FR/ENclair ;8groupesinteractions. cold.json conserve4échecs hashDocs à froid sur10899, corrigés11099 séparément. Interactions non rejouées sur chaqueformat. Aucun import/achat/runtime ; panne503auxlibellésindistincts non corrigée.

[Preuves et méthode](public-next/README.md). Build/serveur :10899.

### docsSSR11099

16contextes froids FR/EN×thèmes×320/1440×première/dernièresection, chacunAccueil/Retour ;2zoomsnatifs200% FR/ENclair. 16contextes avecRetour, pas32cas distincts ; pas toutesancres à tousformats. Diagnostic rect0avant rendu conservé séparément, aucun fauxéchecproduit. Fonctionnalités illustrées non validées.

[Preuves et méthode](public-next/after11099/README.md). Build/serveur :11099.

### account-inactivity10899

20observations :320×900,390×844,844×390,820×1180,1440×900×FR/EN×thèmes ;4groupes focus/Retour. 4reproductions du scroll bloqué paysage conservées ; pas un verdict toutvert avantcorrectif.

[Preuves et méthode](account-inactivity/README.md). Build/serveur :10899.

### account-inactivity11099

4groupes FR/EN×thèmes844×390 :wheel/PageDown, dernierparagraphe atteint par petitsgestes, menu verrou/focus/reprise, resize/Retour. Pas replay20géométries. Focus mailto conservé mais visibilité non garantie aprèsresize (horsviewport/sousheader). Aucun envoi/mailtoactivé.

[Preuves et méthode](account-inactivity/after11099/README.md). Build/serveur :11099.

### scroll-regression11099

1nouveau test E2E existantsuite :FR844×390 wheel260 etPageDown, un geste puispolllecture déplacement>100 ;0retry. Déplacement utilisateur, pas visibilitéfinaleentière. Tentative10899interrompueserveur exclue. Pas relecture anciens85guards.

[Preuves et méthode](scroll-regression/README.md). Build/serveur :11199 rouge ancienCSS puis11099 vert.

## Limites transversales

- Historical42 and newly evidenced6 are unique route IDs, not sums of observations, panels or dynamic parameter values.
- All evidence local Chromium, synthetic APIs or anonymous public pages. No production authenticated recipe, real mutation or backend acceptance.
- Security body x43 intrudes4px into simulatedsafe47; mailto focus afterresize on account-inactivity can remain outofview; Templates503 labels unresolved.
- No AppShell bottom navigation observed in eight10599cases; historical request remains open. IDE bottomnav proof is distinct and does not satisfy AppShell.
- No new Safari/Firefox, real screenreader, OS keyboard, hardware safeareas or dynamic nativezoom-during-typing acceptance.
- Nativezoom only explicitly named subgroups; no claim everypage/form/state tested.
- CI, merge and rollout tracked separately; none changes UI proof status automatically.

Le scroll Security est rétabli sur11099, contrairement à l’avant et aux premières contrepreuves ; sa limite horizontale reste ouverte. Le hash froid Docs est validé sur11099, distinct des88géométries10899 non rejouées. Les défauts/diagnostics rouges restent archivés et ne sont pas masqués par un total courant.

Aucun nouveau parcours exécuté pour cette consolidation documentaire. Contrôles :357IDs uniques correspondant exactement à routes.json ; six transitions non_exerce→teste_local_partiel ; chemins de preuves existants ; aucun fichier historique modifié.
