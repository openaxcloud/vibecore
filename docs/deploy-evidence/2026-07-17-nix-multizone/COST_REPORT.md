# D3 — Store Nix multi-zone : rapport de coût MESURÉ (europe-west9)

Mesures du 2026-07-17. Prix tirés de l'API Cloud Billing Catalog
(`services/6F81-5844-456A/skus`, USD, région `europe-west9`) ; tailles tirées
de `gcloud compute disks/snapshots describe` (projet `vibecore-495216`).

## SKUs mesurés (USD / GiB / mois, europe-west9 « Paris »)

| SKU | Prix mesuré |
|---|---|
| `Storage PD Capacity in Paris` (**pd-standard zonal**) | **0.0464** |
| `Regional Storage PD Capacity in Paris` (**pd-standard régional**) | **0.0928** (2× zonal) |
| `SSD backed PD Capacity in Paris` (pd-ssd zonal) | 0.1972 |
| `Regional SSD backed PD Capacity in Paris` (pd-ssd régional) | 0.3944 |
| `Balanced PD Capacity in Paris` (pd-balanced zonal) | 0.1160 |
| `Regional Balanced PD Capacity in Paris` (pd-balanced régional) | 0.2600 |
| `Storage PD Snapshot in Paris` (snapshot standard) | 0.0580 (sur octets **stockés**, compressés) |
| `Regional Archive Snapshot Data Storage in Paris` | 0.0220 |

Google facture les disques sur la **capacité provisionnée** (80 GiB ici), pas
les données utilisées ; les snapshots sur les octets réellement stockés.

## Tailles mesurées

- Disque source `nix-store-v2` : **80 GiB provisionnés**, pd-standard, zone-a ; utilisé ≈ 1.9 GiB (2012 chemins signés).
- Snapshot `nix-store-v2-gen2-20260717` : `storageBytes=532467904` ≈ **0.496 GiB facturables**.
- Clone `nix-store-v2-b` (zone-b) : **80 GiB provisionnés** pd-standard (une restauration de snapshot ne peut pas être plus petite que le disque source).
- Zones sandbox actives : **2** (a, b).

## Option (a) — retenue par Avi : snapshot signé + clones zonaux pd-standard

| Poste | Calcul | USD/mois |
|---|---|---|
| Disque zone-a (existant) `nix-store-v2` | 80 × 0.0464 | 3.712 |
| Disque zone-b (nouveau) `nix-store-v2-b` | 80 × 0.0464 | 3.712 |
| Snapshot de génération | 0.496 × 0.058 | 0.029 |
| **Total (2 zones)** | | **7.45** |
| **Surcoût vs avant** (zone-a seule) | | **+3.74** |
| Extension 3ᵉ zone | +80 × 0.0464 | +3.71/zone |

Nota : le disque `nix-store-spike` (gen-1, 80 GiB pd-standard, zone-a,
3.712 USD/mois) n'est plus référencé par le configmap live ; sa suppression
est une décision d'Avi.

## Option (b) — benchmark demandé : Regional PD

- Regional pd-standard : 0.0928 USD/GiB/mois, **taille minimale 200 GiB** → 200 × 0.0928 = **18.56 USD/mois**.
- Regional pd-balanced (min 10 GiB) : 80 × 0.26 = **20.80 USD/mois**.
- Limites structurelles : 2 zones fixées à la création (pas de a+b+c), bascule de génération = mutation en place (contraire à la décision), fail-over régional inutile pour un volume RO déjà identique par zone.

## Conclusion chiffrée

Architecture retenue (a) : **7.45 USD/mois** pour 2 zones (**+3.74 vs
aujourd'hui**), +3.71/zone supplémentaire, zéro mutation en place. Regional PD
mesuré à 2.5–2.8× plus cher pour 2 zones max. L'hypothèse « ~10 $/mois »
est remplacée par la mesure : surcoût réel ~3.7 $/mois, total ~7.5 $/mois.
