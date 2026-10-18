# Qualification partielle des alertes de dépendances — 18 octobre 2026

Observation : CI `39154310054`, job `117754240691`, tête #735
`1d2755086f5d05d41c1d12739dcfd230a1a99044`, audit à 18:51:26 UTC.
242 alertes : 28 faibles, 118 modérées, 92 hautes, quatre critiques.
Ce sont des alertes sur le graphe de dépendances du dépôt, pas un comptage
de vulnérabilités démontrées dans les images servies. Les 238 autres alertes
ne sont pas qualifiées par la présente lecture.

| Alertes critiques | Chemin établi dans la CI et le lockfile | Qualification et suite nécessaire |
| --- | --- | --- |
| Deux résultats pour une même advisory Capacitor | `apps/mobile` → `@capacitor/android@8.3.1` et `@capacitor/ios@8.3.1` | Surface native Android/iOS, distincte du navigateur mobile et de Safari. L'advisory confirme ces versions affectées et cite 8.4.3/8.5.1 parmi les versions corrigées. Mise à niveau cohérente, reconstruction et redistribution natives à valider avant d'inclure ces applications dans l'offre. Aucune mise à niveau ni preuve de binaire natif corrigé ici. |
| Deux advisories Tinypool | Vitest 3.2.6 → `tinypool@1.1.1`, quinze chemins signalés par l'audit | Moteur de tests présent dans le graphe de développement. Les advisories concernent deux usages d'options après pollution de prototype ; la version corrigeant les deux est 2.1.2. Présence confirmée, primitive de pollution et exploitabilité dans ce projet non démontrées. Une mise à niveau/validation de compatibilité du moteur de tests reste nécessaire. |

Sources officielles relues le 18 octobre :
[Capacitor GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv),
[Tinypool options du worker GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3),
[Tinypool options de run GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
Le tableau npm de cette CI affiche `<0.0.0` comme plage corrigée Capacitor,
alors que l'advisory officielle liste des versions corrigées : ne pas conclure
« aucun correctif amont » à partir de cette seule cellule.

Le code actuel possède déjà des protections de packaging : `pnpm prune --prod`
et élagage des entrées non atteignables dans le Dockerfile web, test positif
de démarrage après élagage, et garde de dépendances admin. Vitest a été déplacé
dans les dépendances de développement admin par #679 ; voir la fiche existante
`docs/bugs/BUG-SEC-ADMIN-TEST-RUNTIME-001.md`. Ces mécanismes et le scan bloquant
des images ne remplacent pas la lecture du SBOM de la livraison exacte.

Le dernier rollout observé (#733) a passé le scan bloquant et les signatures,
mais son manifeste complet et ses SBOM n'ont pas été téléchargés dans ce
workspace. L'absence effective de ces paquets dans chaque image actuellement
servie n'est donc pas certifiée par ce dossier. Aucun scan offensif, aucune
modification de dépendance, aucune dérogation ajoutée.

Décision de périmètre : les applications natives peuvent être reportées
uniquement si elles sont explicitement exclues de l'offre annoncée. Si elles
font partie du lancement demandé, leur correction et leur validation restent
un indispensable, pas une amélioration cosmétique. Le risque de la chaîne
de build/tests reste à traiter même pour une offre web.
