# Skills : références textuelles sauvegardées — recette isolée du 30 octobre 2026

Complément séparé à #865, lui-même fondé sur #863. **Aucune fusion, livraison, recette Skills de production ou invocation fournisseur IA.**

## Défaut et comportement corrigé

L'installation ne récupérait que le manifeste racine. Une instruction demandant de consulter `references/guide.md` pouvait donc être sélectionnée sans ce fichier. #865 rendait cette absence honnête mais ne réalisait pas le chargement. Ce complément réalise l'installation, la persistance, la consultation et l'inclusion des références textuelles prises en charge.

Le parcours reste dans les permissions existantes du projet ou de l'organisation : la route d'installation autorisée récupère le manifeste et ses références publiques explicites dans le même dépôt GitHub, audite leur contenu ensemble, puis sauvegarde le lot dans le champ JSON existant de l'installation. Un échec de référence refuse l'installation entière avec une erreur traduite ; aucune installation partielle n'est créée. L'approbation explicite d'une installation en quarantaine reste distincte de son activation.

## Modèle de chargement sûr implémenté

- Références découvertes dans les liens Markdown, définitions de liens et chemins locaux entre backticks, y compris dans les références imbriquées. Pas d'exploration du dépôt ni d'interprétation de commandes.
- Seuls `references/` et `assets/`, extensions `.md`, `.txt`, `.json`, `.csv`, UTF-8 textuel, sont admis. Scripts, binaires, chemins absolus, remontées `..`, encodages percent, antislashs et query strings sont refusés. Les liens externes ne sont jamais suivis.
- Origine fixe `raw.githubusercontent.com`, dépôt normalisé, aucune redirection. Lecture streaming bornée, sans troncature : 32 Kio par référence, 128 Kio par lot, huit fichiers, profondeur trois, six secondes par fichier et vingt-quatre secondes par lot. Le manifeste est borné à 200 Kio et 50 000 caractères. Les réponses partielles, contenu invalide, fichiers manquants et dépassements font échouer le lot.
- L'audit existant reçoit le contenu de chaque référence avant sauvegarde. Son classement bloqué/quarantaine reste applicable. Les textes enregistrés portent leur taille UTF-8 et une empreinte SHA-256. Ce filtre n'est pas une garantie de sûreté absolue contre toutes les injections.
- À chaque tour, la sélection explicite/lexicale existante choisit les skills. Le serveur vérifie chemins, taille, empreintes et intégralité du lot, puis inclut les instructions L2 et toutes les références sauvegardées L3 de chaque skill retenue. Budget total de références : 128 Kio par tour. Une skill incomplète ou dépassant le budget n'a ni L2 ni L3 chargés ; le contexte explique qu'elle est indisponible. Pas de fetch pendant la génération.
- Les références sont encadrées comme données JSON échappées, avec interdiction explicite de lancer leur contenu, d'installer des dépendances, de donner des permissions ou de récupérer un fichier additionnel sur leur seule demande. La trace L3 mesure les vrais octets fournis. Elle ne signifie pas que le fournisseur a exécuté ou suivi la skill.
- Le panneau affiche les copies sauvegardées dans un aperçu texte repliable et accessible. Ni rendu HTML, ni exécution, ni requête réseau au clic. Les anciennes métadonnées sans contenu sont explicitement indisponibles.

## Limites et décision restante

Cette implémentation rend utilisables les références textuelles déclarées et prises en charge. **Elle ne rend pas toutes les skills tierces pleinement fonctionnelles.** Les scripts, images, PDF, autres fichiers binaires, dépendances externes et chemins non pris en charge sont exclus. Une skill qui en a besoin ne peut pas être accomplie fidèlement ; aucune réussite complète ne doit être annoncée. Une éventuelle exécution future nécessiterait une conception et une autorisation distinctes, absentes ici.

Les liens externes restent des liens non téléchargés ; les dépendances décrites uniquement en prose ne sont pas détectables exhaustivement. Le contexte impose de signaler tout élément nécessaire absent et d'arrêter l'étape concernée. Les anciennes installations sans snapshots doivent être réinstallées pour ce parcours ; aucun remplacement automatique en production. Les copies viennent de HEAD au moment de chaque téléchargement, **pas d'un commit Git atomiquement épinglé** ; l'ensemble exact sauvegardé est toutefois audité puis vérifié par empreinte.

La sélection reste lexicale, avec priorité aux dépôts explicitement nommés. Elle n'est pas une reconnaissance sémantique. Les mises à jour amont ne modifient pas les snapshots installés.

## Preuves

- Tests unitaires des limites de lecture, chemins, redirections, contenu, profondeur, audit et refus sans lot partiel.
- Tests HTTP + Prisma sur PGlite isolé, données fictives, migrations réelles hors trois migrations AgentMemory/pgvector sans rapport : installation, persistance du contenu/empreinte après réouverture, autorisations et quarantaine. Les réponses GitHub sont des fixtures synthétiques au seul bord réseau ; aucun dépôt tiers installé.
- Tests du chemin réel de préparation `streamText` : les références apparaissent dans le message système et la trace L3 ; elles disparaissent après désactivation. L'appel SDK est intercepté. **Aucune réponse modèle réelle n'a été exécutée ni validée.**
- Tests de composant EN/FR : aperçu texte, accessibilité, ancien contenu absent, HTML traité comme texte.
- Chromium sur build compilé, données fictives via vraie API et vraie base isolée : 390, 820, 1280 px, toggle persistant après rechargement, aperçu de référence lisible, catalogue recherchable, absence de débordement horizontal. `browser.cjs`, `browser.json`, captures `skills-*.png`.

Commandes de recette : même démarrage base/fixture/API que `../skills-20261030/README.md`, puis `node docs/qa/skills-l3-20261030/browser.cjs`. Les requêtes navigateur externes, chat et runtime sont bloquées. Le fixture server n'accepte que l'URL loopback dédiée sous NODE_ENV=test.

## Contrôles et état

Résultats locaux : 90 tests API distincts (86 helper/manifeste/routes/audit et quatre HTTP+Prisma), 77 tests application et six tests de cohérence de l’inventaire passent. Build web client/SSR, lint application (zéro erreur, avertissements existants), lint ciblé des nouveaux helpers API, catalogues et garde i18n passent. Une tentative de répétition Prisma pendant que le serveur fixture occupait la base PGlite a échoué à se connecter ; après arrêt du serveur fixture, les quatre tests Prisma passent sans modification de code ni de test. Le lint global API n’est pas revendiqué : la commande officielle racine couvre app, et appliquer sa configuration aux anciens fichiers API produit des erreurs de style/alias préexistantes. Le typecheck global rencontre le bootstrap pnpm local hors workspace ; ses étapes web/scripts/IDE/Electron passent, et les mêmes contrôles workspace sont exécutés avec `--config.verify-deps-before-run=false` sur les dépendances déjà présentes. Aucun import, seuil ou contrôle n'est affaibli.

📤 Dispatché ☑ · 💻 Codé sur main ☐ (branche seulement) · ✅ Testé Skills production ☐.
La recette authentifiée de production reste à coordonner après livraison. Les PRs #863/#865 sont surveillées sur leur tête exacte, sans relance ni fusion concurrente.

## Suivi CI et frontière d'accès

La première tête #867 (`444e5b343`) a échoué dans le test de la liste fermée `ACTIONABLE_PANEL_CODES` : le nouveau code Skills légitime n'avait pas été ajouté à l'attente exhaustive. Correction limitée à cette attente et à sa justification ; la liste reste exacte et le masquage des erreurs inconnues demeure testé. Les 20 tests des routes Database/Skills passent ensemble.

Douze contre-tests supplémentaires confirment que les liens localhost/loopback IPv4 et IPv6, adresses privées, métadonnées cloud et `file://` inclus dans une référence ne sont jamais suivis, et que les dépôts tentant de modifier la structure de l'URL sont refusés sans fetch. Les 72 tests helper ressources/manifeste passent. Le chemin de production construit lui-même l'URL HTTPS du même dépôt sur raw.githubusercontent.com, refuse les redirections, ne lit aucun fichier local et ne reçoit pas `fetchImpl` depuis la requête utilisateur ; cette injection est uniquement une couture de test. Les références sont lues depuis la base autorisée lors de la préparation du contexte, sans fetch à ce stade.

L'aide du panneau EN/FR précise désormais que seuls les textes sauvegardés sont pris en charge et qu'une compétence exigeant scripts, binaires ou dépendances externes ne peut pas être appliquée entièrement. Il ne s'agit pas d'une sandbox d'exécution de scripts tiers. Les services de recette restent arrêtés. Aucun nettoyage ni lint précédemment refusé n'a été retenté.
