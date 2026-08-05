# Politique de masquage des IBAN au remix

**Arbitrage Avi du 2026-08-05.** Implémentation : `services/api/src/remix-pipeline.ts`
(`scanIbans`) et `services/api/src/remix-pii-metrics.ts`. Contexte : P0-V3-05.

## Les 4 règles

| # | Situation | Décision |
|---|---|---|
| **R1** | Pays **connu** du registre + longueur nationale **exacte** | **MASQUER TOUJOURS** — checksum MOD-97 valide **ou non** |
| **R2** | — | Le checksum **n'est jamais une condition**. Il ne sert qu'à **qualifier** (métrique `checksum_valid`) et ne laisse jamais réapparaître le numéro |
| **R3** | Pays connu + longueur **incorrecte** (trop court ou trop long) | **NE PAS masquer** — ce n'est pas un IBAN de ce pays |
| **R4** | Pays **absent** de la table | **NE PAS masquer** + **log d'avertissement** + compteur `unknown_country_code` |
| **R5** | — | **Ne jamais dépasser** la longueur officielle : aucun texte voisin absorbé |

## Pourquoi R1 : la confidentialité prime

Un IBAN mal saisi **reste une donnée bancaire sensible**. Avant cet arbitrage, le
checksum conditionnait le masquage : une faute de frappe suffisait à laisser le numéro
en clair dans le clone. C'était un arbitrage à l'envers — on protégeait la propreté du
texte au détriment de la donnée personnelle.

Le checksum garde une utilité réelle, mais **en observation seulement** : un taux élevé
de `checksum_valid="false"` signale soit des données de test, soit un problème de
qualité en amont. Il ne décide plus rien.

## Pourquoi R3 et R4 : ne jamais corrompre

Deux tentatives par regex ont échoué en production avant d'en arriver là :

| version | groupe final | défaut |
|---|---|---|
| v1 | `[A-Z0-9]{0,3}` collé | `FR76 … 189` : fragment terminal **laissé en clair** |
| v2 | `(?:\s?[A-Z0-9]{1,3})?` | `ES91 … 1332 EUR` : **avale** ` EUR` — corruption silencieuse |

Un IBAN **n'est pas auto-délimitant**. Trop court → fuite ; trop long → corruption. Seule
la **longueur nationale** tranche, d'où la table `IBAN_LENGTH_BY_COUNTRY`
(ISO 13616-1 / Swift IBAN Registry, gelée, provenance datée dans
`IBAN_REGISTRY_PROVENANCE`).

R4 est le corollaire honnête : si le pays est inconnu, on ne peut pas connaître la
longueur, donc **on ne masque pas** — mais on refuse que ça passe inaperçu. Le log et le
compteur existent pour qu'un nouveau pays au registre devienne **visible** et déclenche
une mise à jour de la table, plutôt qu'une fuite silencieuse.

Le signalement R4 ne se déclenche que sur un candidat **plausible** (longueur totale
entre 15 et 34, bien délimité) : sans ce garde-fou, tout `ab12` d'un fichier source
noierait la métrique.

## Métriques

Exposées par `formatRemixPiiMetrics()` :

```
remix_pii_iban_masked{checksum_valid="true"}  N
remix_pii_iban_masked{checksum_valid="false"} N
remix_pii_iban_unknown_country_code{country="ZZ"} N
```

Le pipeline de masquage reste **pur** : `maskPiiInFiles()` **renvoie** ses observations
(`PiiMaskingObservations`), et c'est `app.ts` — au bord — qui incrémente les compteurs et
émet le `log.warn`. La décision de masquer ne dépend donc jamais d'un état global.

## Limites déclarées

- **Pays hors table non masqué** (R4). Choix assumé : ne pas masquer plutôt que corrompre
  du texte voisin. Le compteur est là pour que ce trou soit *mesurable*, pas ignoré.
- Le masquage ne couvre pas les **fichiers binaires** ni les **chemins de fichiers** —
  limites générales du pipeline PII, indépendantes de l'IBAN.

## Rejeu

```bash
npx tsx docs/deploy-evidence/2026-08-04-v305-reserves/replay-iban-expert.ts
```

17 cas : devises adjacentes (EUR/USD/GBP/CHF), colonnes CSV, tabulation, ponctuation,
plusieurs IBAN dans une phrase, espaces insécables, forme compacte, **checksum faux
désormais masqué**, longueurs incorrectes non masquées, **pays inconnu non masqué et
signalé**.
