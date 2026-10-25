# Recette après intégration locale de main d09045d5a

Build compilé du worktree `vibecore-ui-next`, fusion locale préparée de `origin/main` d09045d5a dans le commit UI3084fcf74. Le merge commit n'était pas créé au démarrage de cette recette. Serveur local7099/API synthétique3199 ; empreintes de l'artefact et des fichiers concernés dans `source-sha256.txt`. Aucun déploiement ou compte de production testé.

## Résultats

- **Menus Projets :16/16 parcours** sur320/390/820/1440 ×FR/EN ×clair/sombre. Menu visible et contenu, scroll conservé, activation clavier, Échap restitue le focus, clic extérieur ferme, renommage reçoit le focus et conserve le brouillon au resize puis annulation, confirmation de suppression annulée. Aucune requête de mutation : `writes: []`.
- **Facturation :48 observations** :44géométries (320/360/390/paysage844×390/768/820/1024/1280/1440/1920/2560 ×FR/EN ×clair/sombre) et4groupes d'interactions. Valeur500 conservée pendant resize, erreur503 visible/focalisée et répétée, reflow640, hauteur réduite320, pinch200% (`visualViewport.scale=2`). Aucune erreur JavaScript enregistrée par cette sonde.

Les sondes bloquent les requêtes tierces. Les soumissions Facturation ciblent uniquement la fixture locale, qui refuse les mutations HTTP503. Aucun changement réel d'abonnement, achat ou suppression. Les tests menus ne sont pas les tests des menus IDE#788 ; cette recette ne certifie pas Deploy/Git/Domains ou le hub Intégrations.

## Reproduction et portée

Scripts réutilisés depuis `scripts/project-menus.cjs` et `scripts/billing.cjs` du dossier de preuves parent, seuls chemins de sortie isolés dans `/tmp/ui-integration-menus-billing`. Avec Chromium `/usr/bin/chromium`, les dépendances du dépôt, fixture3199 et build servi depuis la racine contenant `build/client` :

```
mkdir -p /tmp/ui-integration-menus-billing
UI_BASE_URL=http://127.0.0.1:7099 node docs/bugs/user-area-2026-10-25/integration-main-d090/menus-billing/project-menus.cjs
UI_BASE_URL=http://127.0.0.1:7099 node docs/bugs/user-area-2026-10-25/integration-main-d090/menus-billing/billing.cjs
```

Les deux commandes sont sorties0. ReçusJSON et journaux complets archivés, capture du menu320 et alertes Facturation FR/EN clair/sombre. Aucune reconstruction pendant la recette. Le pinch est distinct du zoom desktop natif ; ce dossier ne remesure ni zoom natif, lecteur écran, clavier OS, safeareas ni navigateurs autres que Chromium. Les tests de navigation Projets et palette sont réalisés séparément par le parent.
