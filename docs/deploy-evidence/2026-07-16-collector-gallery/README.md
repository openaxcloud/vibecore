# COLLECTEUR + GALLERY + REGISTRES (audit v4) : preuve (2026-07-16)

## P0-#1 — Collecteur enrichi (routes produit rendues JS + canal de lancement)
`scripts/parity/collect-baseline.mjs` : 3 familles (docs / launch-channel /
product-route). Les product-routes sont RENDUES via navigateur headless (UA
réaliste — un fetch brut de replit.com/community est bloqué Cloudflare ou ne
renvoie qu'une coquille). Run réel :

```
OK community [product-route/rendered] bytes=63685 links=32 \
  watch=Community Profiles|Community Profile|Claim your profile|Buildathons sha256=e9b562a2…
OK gallery   [product-route/rendered] bytes=1499556 watch=Submit your App sha256=fad9ec75…
OK pricing   [product-route/rendered] bytes=284403 sha256=1202f9dd…
```

**Preuve exigée obtenue** : le collecteur RETROUVE Community Profiles —
`manifest.watchHits["Community Profiles"] == ["community"]`. Un collecteur
doc-only ne l'aurait jamais vu (lancé la semaine du 16/07).
Snapshot : `docs/parity/baseline/snapshots/2026-07-16/` (manifest schemaVersion 2,
familles + watchTerms + watchHits).

## P0-#2 — Gallery requalifiée sur mesures (pas déductions)
Rendu JS mesuré de replit.com/gallery (sha256 fad9ec75…, archive
`gallery.rendered.html`) + page détail (journey-mapper, sha256 5e1d5729…) :
- auteurs (Mark Mathson, Manny Bernabe…), « Views 20,650 », « Used 79 times »,
  ~22 catégories, « 82 Results », pages détail /gallery/work/… ;
- « Submit your App » → form.typeform.com/to/yVYAWg79 (Typeform EXTERNE =
  intake humaine curée, PAS self-service).
Registres : `RPL-17` VERIFIED, `RPL-18` CONFIRMED (Trust & Safety), `RPL-19`
VERIFIED (Community Profiles), sources `SRC-GALLERY-RENDERED` /
`SRC-GALLERY-DETAIL-JOURNEY-MAPPER` / `SRC-COMMUNITY-RENDERED` (URL+hash+archive).

**Conséquence produit (DECISION_REGISTRY DEC-GALLERY-NO-SELF-PUBLISH)** : un
bouton « Publish to Gallery » self-service serait un DÉPASSEMENT, pas de la
parité — à assumer comme décision E-CODE avec son coût de modération, ou à ne
pas faire.

## Statut CALCULÉ, jamais écrit à la main
`APPROVAL_STATUS.json` est GÉNÉRÉ par `generate-approval-status.mjs` depuis les
registres. Le validateur ré-exécute le générateur et ÉCHOUE sur toute dérive
(`APPROVAL_STATUS.json DRIFT`). Registres : `P0_REGISTRY.yaml` (4 P0),
`DECISION_REGISTRY.yaml` (3), `UNKNOWN_REGISTRY.yaml` (4), chacun avec owner /
priority / nextAction / targetDate / expiration.

CI (`validate-registries.mjs`) ajoute : refs croisées surfaces↔e2e sans ID
orphelin ; freshness SLA 30j des sources ; aucune surface DONE sans evidenceId ;
**aucun P0 CLOSED sans commit + reviewer réel + preuve** (nos 4 P0 sont donc
PROVEN, pas CLOSED — pas de reviewer humain).

## Honnêteté / 🟡
- Rendu JS en CI GitHub (chromium + bypass bot) : non prouvé (UNK-COLLECTOR-CI-RENDER).
- Reviewer humain des P0 : absent → statut PROVEN, pas CLOSED.


## ⚠️ CORRECTION 2026-07-21 (refus RR-20260720-CODEX-02 : V4-1/V4-2)

Les hashes cités CI-DESSUS sont la sortie du RUN D'ORIGINE, AVANT
assainissement des snapshots (caviardage d'un identifiant CMS — passe
gitleaks du 16/07 au soir). Les ARTEFACTS CANONIQUES actuels sont :

- `docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html`
  sha256 `1f5f27bcf87743017d2e1aee8768f941041a2ebe17b21127b76db83c241bd4c7`
  (1 499 556 octets — même capture, hash changé par l'assainissement) ;
- `docs/parity/baseline/snapshots/2026-07-16/gallery-detail-journey-mapper.rendered.html`
  sha256 `885a7c3772643090…` (assaini).

Métriques RÉELLES relues dans ces artefacts : « 20,653 » vues (liste) /
« 20,649 » + « Used 79 times » (détail) — PAS « 20,650 ». Le libellé
« 82 Results » n'apparaît PLUS dans le rendu conservé — retiré des claims.
`gallery-rendered.png` ne montre que le footer : capture partielle,
SUPPLANTÉE par les HTML complets ci-dessus (conservée comme trace du run).
