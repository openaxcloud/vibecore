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

Le signalement R4 ne se déclenche que sur un **candidat plausible**, défini
précisément ci-dessous : sans ce garde-fou, tout `ab12` d'un fichier source noierait la
métrique.

## Définition normative — « candidat plausible »

C'est le **contrat de stabilité de R4** : le modifier change ce que mesure
`unknown_country_code`. Miroir exact du bloc `DÉFINITION NORMATIVE` dans
`remix-pipeline.ts` (`scanIbans`). Un jeton est un candidat plausible **si et seulement
si** les 4 conditions tiennent.

**C1 — Structure.** Exactement **2 lettres ASCII** puis **2 chiffres ASCII**
(`/[A-Za-z]{2}[0-9]{2}/`), puis un corps **alphanumérique ASCII**. La casse est libre ;
le code pays est normalisé en majuscules.

**C2 — Normalisation.** On retire les **séparateurs internes** pour mesurer :

| autorisé | code |
|---|---|
| espace | `U+0020` |
| tabulation | `U+0009` |
| espace insécable | `U+00A0` |
| insécable étroite | `U+202F` |
| espace numérique | `U+2007` |
| espace fine | `U+2009` |
| gluon (word joiner) | `U+2060` |

Un séparateur n'est franchi **que s'il est suivi d'un alphanumérique** : il n'est jamais
consommé en fin de jeton. Le **trait d'union est exclu** — il sépare deux champs voisins
bien plus souvent qu'il ne groupe un IBAN, et le consommer rejouerait le bug « EUR ».

**C3 — Longueur.** La longueur **après normalisation** est comprise entre **15 et 34
inclus** (bornes du registre ISO 13616, tous pays confondus).

**C4 — Délimitation.** Le caractère qui **précède** le début n'est pas alphanumérique, et
celui qui **suit** la fin ne l'est pas non plus. Un jeton plus long qu'un IBAN n'est donc
jamais un candidat.

## Échantillonnage du log (garde-fou)

La **métrique** compte **chaque** candidat plausible — c'est elle qui dit si le phénomène
monte. Le **log** ne sert qu'à *diagnostiquer*, et il est **borné** : un fichier de seed
de mille lignes ne doit pas produire mille lignes de journal.

- **Règle** : le **premier candidat de chaque code pays** par fenêtre d'observation.
- **Plafond** : au plus **10 codes pays distincts** journalisés par fenêtre — la
  cardinalité reste bornée même face à des données adverses qui feraient défiler les
  codes pays.
- Une remise à zéro de la fenêtre (`resetRemixPiiMetrics()`) réarme le log.

**Le log ne porte AUCUN fragment du candidat — pas même tronqué.** Ni le corps, ni la
clé de contrôle, ni un préfixe. Un spécimen tronqué (`ZZ91…`) avait été envisagé puis
**retiré** : la clé de contrôle est dérivée du numéro de compte, et rien n'oblige à la
journaliser pour savoir qu'un pays manque au registre.

Le log ne contient que des **métadonnées non sensibles** :

| champ | exemple | pourquoi c'est sûr |
|---|---|---|
| `countryCode` | `ZZ` | c'est **l'information à diagnostiquer** |
| `normalizedLength` | `24` | une longueur, pas une valeur |
| `decision` | `UNKNOWN_COUNTRY_CODE` | catégorie de décision |
| `remixJobId` | `cms…` | corrélation, sans donnée personnelle |

```
WARN  remix PII: IBAN-shaped value whose country code is absent from the ISO 13616
      table — NOT masked; update IBAN_LENGTH_BY_COUNTRY (no candidate value is
      logged; further occurrences of this country are not logged)
      countryCode=ZZ  normalizedLength=24  decision=UNKNOWN_COUNTRY_CODE  remixJobId=…
```

### Cardinalité des métriques

`unknown_country_code` est indexé **par code pays** : c'est un libellé alimenté par des
**données**, donc une porte ouverte à l'explosion de séries temporelles. Elle est bornée :

- au plus **20 libellés nommés** ;
- au-delà, tout s'agrège sous `__other__` ;
- le **total reste exact** — seule la ventilation est bornée, rien n'est perdu.

Le rendu Prometheus ne produit donc jamais plus de 21 séries pour cette métrique, quelles
que soient les données rencontrées.

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

Les garde-fous d'échantillonnage et la définition C1–C4 sont couverts par
`services/api/src/remix-pipeline.spec.ts` (bloc « IBAN — longueur nationale »).
