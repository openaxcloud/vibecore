# WebKit local : indisponible, aucune recette exécutée

Playwright est installé, mais son binaire WebKit attendu n’existe pas : `/home/agent/.cache/ms-playwright/webkit-2272/pw_run.sh`. La tentative `webkit.launch({headless:true})` échoue exactement avec :

```text
browserType.launch: Executable doesn't exist at /home/agent/.cache/ms-playwright/webkit-2272/pw_run.sh
```

`webkit.executablePath()` et `fs.existsSync()` confirment ce chemin absent. `PLAYWRIGHT_BROWSERS_PATH` est absent ; la recherche en lecture seule dans les caches conventionnels, `/workspace`, `/tmp` et `/opt` ne trouve aucun `pw_run.sh`/`MiniBrowser` alternatif. Le profil temporaire créé pendant la tentative n’est pas un moteur disponible. [Constat machine](availability.json).

Aucune installation, dépendance système, demande d’accès, coût, mutation produit ou essai réseau WebKit effectué. Aucun refus d’autorisation : blocage matériel d’exécution par absence du binaire. Ce n’est ni un échec produit ni un test Safari/iOS physique.

Support, Quota, Downgrade, Données/Connexions du compte restent **non exécutés dans WebKit** sur320/390/paysage844×390/tablette820/desktop1440, FR/EN clair/sombre. Aucun focus, Escape, Retour, resize, erreur/récupération ou autre résultat d’un moteur Chromium n’est transféré à WebKit.

Le parent autorise séparément un complément Chromium local sur Données/Connexions, avec fixture6099 et serveur11699 gérés par public_ui_audit. Ses preuves seront archivées séparément ; elles ne lèvent pas cette limite WebKit. L’ajout éventuel du moteur n’a pas été exécuté dans cette mission de vérification de disponibilité.
