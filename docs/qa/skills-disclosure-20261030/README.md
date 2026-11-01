# Complément Skills : sélection explicite et limites réelles

Complément séparé, basé sur la tête `c45b9626f9720dc74ba04ac7815afefc59e3360f` de #863. Aucune fusion ni livraison. Recette Skills production toujours non effectuée ; la reconnexion rétablie ne constitue pas une recette.

## Impact utilisateur confirmé

**Sélection lexicale : défaut fonctionnel pour une demande explicite.** Une compétence activée nommée `UI`, `Été` ou `校对` pouvait ne jamais fournir ses instructions même si l'utilisateur écrivait « Utilise UI ». Le filtre précédent ne retenait que des fragments ASCII d'au moins quatre caractères. Pour une compétence anglaise, une demande française équivalente sans mots communs ne chargeait pas non plus ses instructions. Le modèle recevait seulement nom/description et n'avait aucun outil pour ouvrir ensuite le corps manquant. Il pouvait donc répondre sans la méthode installée.

Le complément reconnaît d'abord le nom affiché, le nom de manifeste ou le dépôt complet `owner/repo`, sans limite de longueur, avec normalisation Unicode et frontières de mots. `UI` ne se déclenche pas sur `build`. Une référence explicite de dépôt sélectionne les dépôts cités et ne charge pas un homonyme par accident. Hors identité explicite, l'heuristique lexicale reste en place ; **elle ne traduit pas et n'infère pas le sens**. L'aide visible du panneau explique ce fonctionnement et comment demander une compétence précise.

**Ressources L3 : promesse UI non tenue, pas seulement une limite de documentation.** Le détail d'une installation ayant des métadonnées de ressources annonçait « chargées à la demande ». Dans le chemin réel, aucune ressource n'était téléchargée/stockée et aucun outil n'appelait `openResource`. Un callback pouvait seulement renvoyer le texte factice « fetch on demand ». Conséquence : une méthode dépendant d'un modèle de document, d'une référence ou d'un script annexe ne peut pas être accomplie fidèlement avec les seules instructions du manifeste.

Le complément retire le faux callback, refuse explicitement l'ouverture sans fournisseur de contenu, ne journalise pas de faux succès L3 et affiche « Ressources déclarées (contenu indisponible) ». Le contexte modèle indique qu'il ne doit pas prétendre avoir lu ou exécuté ces fichiers et doit demander leur contenu si une étape en dépend. **Le téléchargement et l'exécution L3 restent non implémentés.** Ce complément ne prétend pas les remplacer. L'installateur courant ne récupère que les fichiers racine SKILL.md/AGENTS.md/README.md ; les ressources du répertoire ne sont pas énumérées. Le libellé L3 n'est donc visible que lorsque des métadonnées existent déjà (fixture/ancien autre chemin), mais des instructions peuvent malgré tout référencer un fichier manquant.

## Validation isolée

- 47 tests ciblés passent : 33 disclosure, 12 contexte projet, 2 préparation SDK (build/discuss).
- Préparation SDK réelle du message système avec demande française « Utilise UI pour cette page », avant/après désactivation. Frontières registre/fournisseur synthétiques ; aucun appel fournisseur réel.
- Cas : noms courts, accents NFC/NFD, caractères non latins, nom de manifeste, dépôt exact, homonymes, frontières, requête vide, ressource demandée non chargée, absence de trace L3 mensongère.
- Build web client/SSR, typecheck web, ESLint ciblé, validation des catalogues et garde source i18n passent.
- L'exception i18n interne existante suit le libellé précis de l'erreur de programmation `openResource`; nouvelle exception strictement limitée à la description d'une fixture locale, pas à des textes produit.
- Chromium sur build compilé à 390/820/1280 px : aide mise à jour, libellé ressources indisponibles, toggle réel persistant après reload et catalogue recherchable. Captures `help-*.png`, `skills-*.png`, reçu `browser.json`.
- Fixture locale `ecode-proof/ui` : texte synthétique écrit directement dans la base isolée, référence sans contenu. Aucun dépôt tiers téléchargé, aucune ressource exécutée, aucune permission élargie.

Commandes depuis la racine :

```sh
node_modules/.bin/vitest run app/lib/.server/llm/skill-disclosure.spec.ts app/lib/.server/llm/project-skills.spec.ts app/lib/.server/llm/stream-text.skills.spec.ts
node scripts/i18n/validate-catalogs.mjs
node scripts/i18n/scan-source.mjs --check
node_modules/.bin/tsc --project tsconfig.web.json --noEmit --pretty false
```

Pour la recette UI, utiliser le même démarrage de base/serveurs que le rapport #863, puis `node docs/qa/skills-disclosure-20261030/browser.cjs`. Le fixture server ajoute maintenant une installation synthétique `UI` avec une référence sans contenu, sans fetch ni exécution. Le navigateur bloque les requêtes externes et chat/runtime. Les éventuelles lectures automatiques SSR de catalogues modèles ne constituent pas une invocation IA.

## Coordination Database / environnement

Les quatre TS2307 précédemment rapportés étaient dus à trois liens workspace absents dans `node_modules/@vibecore` : `auth`, `database`, `security`. Ils ont été rétablis localement vers `../../packages/<nom>` ; **aucun import source ni contrôle n'a été modifié**.

Après réparation : web, scripts Node, helpers IDE, Electron main/preload passent. Les typechecks de tous les paquets workspace passent également. Le pnpm global de l'environnement tente par défaut une réinstallation et échoue à créer son store hors workspace ; le même groupe de contrôles a donc été exécuté avec `pnpm --config.verify-deps-before-run=false --recursive --if-present --filter '!@vibecore/web' run typecheck`, en utilisant les dépendances déjà présentes. Aucune modification du lockfile ou des exigences de tests.

La branche Database `a2f12d9a60a41e7233c9ba7870e57466a625843f` n'a pas été modifiée et aucune PR Database n'a été créée par cette session.

## Statut

📤 Dispatché ☑ · 💻 Codé sur main ☐ (complément en branche) · ✅ Testé Skills production ☐.
Aucune prétention de sélection sémantique, de chargement/exécution de ressources L3 ou de conformité exhaustive de toutes les variantes UI.
