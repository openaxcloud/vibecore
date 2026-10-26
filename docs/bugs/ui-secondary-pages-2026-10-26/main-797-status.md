# État main #797 — 26 octobre 2026

SHA fusionné : `798fa0f251dec690f81ebd11f0c43eae76c98ba6`.

- Production CI [40253275833](https://github.com/openaxcloud/vibecore/actions/runs/40253275833) : échec de `lecture-declenche-provisionnement.spec.ts:234`. Le diagnostic et la correction du test sont réservés à la session CI, PR #798 ; aucun changement backend/test de provisionnement dans ce lot UI.
- Production E2E [40253275690](https://github.com/openaxcloud/vibecore/actions/runs/40253275690) : succès, 508 tests rapportés / 87 specs, aucun échec final ni dispense appliquée, une relance automatique.
- Cette relance concerne `ide-panel-visibility.spec.ts:62`, onglets à 390 px. À la ligne 83, après fermeture Escape et disparition du panneau, `mobile-bottom-navigation/button-tab-switcher` reste inactif pendant 5 secondes au lieu de reprendre le focus. La relance automatique réussit. Cela diffère des échecs d'ouverture de panneau avant Escape observés dans la PR #796. Cause non établie ici ; aucune modification du moteur ou du test IDE.
- [Déploiement 40253275667](https://github.com/openaxcloud/vibecore/actions/runs/40253275667) : terminé en échec, #797 non livrée à cet instant. Aucun contournement ou relancement manuel effectué.

Les modifications Support/Quota et marge latérale restent locales, sans publication ni fusion pendant le traitement prioritaire de #798. Ces résultats GitHub ne constituent pas une recette UI authentifiée en production.
