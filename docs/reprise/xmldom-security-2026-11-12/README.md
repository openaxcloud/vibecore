# xmldom : correction isolée du parseur SAML

Base : `d9a23c1212208d353baa4fa8d48cce0af24a7d92`.

## Périmètre

- Minimum `@xmldom/xmldom` relevé de 0.9.10 à 0.9.12 dans l'API et l'override racine.
- Exceptions de compatibilité de `plist` et `xml-crypto` dans leur branche 0.8, minimum 0.8.15.
- Aucun contrôle de signature, permission, scan ou porte de livraison supprimé ou affaibli.

Le parseur intervient dans la réception SAML avant validation de la signature. Les avis de déni de service au parsing justifient la mise à jour ; la présence d'autres avis de construction de noms XML ne prouve pas leur exploitabilité dans ce parcours. Les détails historiques sont dans [l'inventaire réseau](../network-dependencies-2026-10-21/README.md).

## Validation

Lockfile régénéré avec pnpm 9.14.4 : seules les deux versions xmldom changent, avec une métadonnée de dépréciation de node-abort-controller. Installation propre avec `--frozen-lockfile` réussie. Nouveau test XML-DSIG : 2/2 passent ; typecheck et build API réussis. Suite API complète : 2793 tests passent, 226 ignorés, 3 échouent (314 fichiers passent, 3 échouent, 26 ignorés). Les échecs concernent `DATABASE_URL` absent (suite PostgreSQL et découverte) et deux attentes 425/502 dans `lecture-declenche-provisionnement.spec.ts` sur ce conteneur. Ils ne sont pas supprimés ni déclarés résolus. Le fichier historique `api.spec.ts` passe intégralement : 130/130. CI exacte avec son PostgreSQL configuré obligatoire avant fusion.

Audit du lock candidat : 267 findings (81 high, 147 moderate, 39 low, 0 critical), aucune entrée xmldom. La référence CI main du 12 novembre comptait 288 findings (98 high, 151 moderate, 39 low). Ces comptes d'audit ne désignent pas nécessairement autant de failles distinctes ou exploitables. Résumé machine joint ; le statut de sortie attendu de l'audit reste 1 puisqu'il demeure des alertes.

Une version inscrite dans un manifeste ne constitue ni une correction livrée ni une preuve de compatibilité.

## Régression de compatibilité réellement reproduite

Le premier test XML-DSIG échoue avec `xml-crypto` 6.1.2 sous l'override global xmldom 0.9.12 : `DOMParser.parseFromString: the provided mimeType "undefined" is not valid`. `xml-crypto` déclare `^0.8.10` et appelle plusieurs fois le parseur sans MIME. Le précédent override global 0.9.10 dépassait déjà cette branche compatible. Les anciens tests SAML signent les octets bruts et passent par le fallback RSA, sans attester XML-DSIG.

L'exception `xml-crypto>@xmldom/xmldom: ^0.8.15` respecte la branche attendue tout en supprimant les versions vulnérables. Aucun monkey-patch ou fallback supplémentaire : le nouveau test signe réellement avec `SignedXml`, fait rejeter l'identité altérée, accepte l'original et rejette le rejeu. Un XML tronqué est refusé sans création de compte ni erreur 500. Ceci n'affirme pas un rejet strict universel des XML malformés.

## Commandes exécutées

- `corepack pnpm install --lockfile-only --ignore-scripts`, puis installation `--frozen-lockfile --ignore-scripts` ; deuxième régénération avec `--prefer-offline` après ajout de l'exception compatible.
- `pnpm --filter @vibecore/api test src/tests/saml-xmldom-regression.spec.ts` : 2/2.
- Fichier `src/tests/api.spec.ts` : 130/130. La tentative de sélection `-t SAML` via pnpm a exécuté tout le fichier ; le compte reporté est celui réellement observé.
- `pnpm --filter @vibecore/api typecheck` et `build` : succès.
- `pnpm run lint` : 0 erreur, 52 avertissements existants.
- Lint du nouveau test avec `no-restricted-imports` désactivé uniquement sur la ligne de commande : les imports relatifs sont le standard des services, l'alias `~/` du lint frontend ne s'y applique pas. Aucune règle enregistrée dans le dépôt n'a changé.
- `plist.parse(plist.build(...))` : aller-retour réussi pour chaînes XML échappées, accents, booléen, nombre et tableau.
- Audit final : exit 1 attendu, compte ci-dessus, aucune entrée xmldom.

Le premier typecheck global a invoqué le pnpm 11 du conteneur depuis ses sous-processus, incompatible avec la configuration pnpm 9 du dépôt. Relancé avec pnpm 9.14.4 en tête de PATH pour tous les sous-processus : typecheck global réussi (web, scripts, IDE, Electron et paquets/services). Aucun lockfile produit par pnpm 11 n'est conservé. Installation sans scripts de dépendances ; les builds desktop natifs ne sont pas validés localement.

## Limites

Lot limité à xmldom ; Fastify, MCP, isomorphic-git, undici et les autres alertes ne sont pas déclarés corrigés. L'audit global demeure consultatif dans le workflow existant. Ni l'absence d'avis pour un package ni une CI verte ne signifient absence de vulnérabilités dans le produit. Aucune recette SSO d'un client ni action de production n'est effectuée par les tests locaux.
