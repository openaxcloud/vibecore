# Paquet v4 — Gallery + Pricing : ARCHIVE PRIMAIRE COMPLÈTE (réponse au reçu RR-20260721-CODEX-04)

Ce paquet remplace le paquet v3 (`2026-07-21-gallery-pricing-v3/`), refusé parce
qu'il n'archivait pas le DOM/HTML primaire et contenait une ellipse éditoriale.
**Ici, le DOM complet est archivé, sans aucune ellipse, et chaque hash est
recalculable par n'importe qui.**

## Artefacts primaires

| fichier | contenu | octets | sha256 |
|---|---|---:|---|
| `replit-gallery-dom.html` | `document.documentElement.outerHTML` COMPLET de https://replit.com/gallery | 1 500 639 | `4e5380a80312f45d59901e281f00a3a181d8ccf705e57c552e1704a0118be5a9` |
| `replit-pricing-dom.html` | `document.documentElement.outerHTML` COMPLET de https://replit.com/pricing | 266 140 | `f69b35f64d1cd3c16be25d4a25a148d43c1561703b2a2921356fac6ba572a957` |
| `network-trace-session.txt` | trace réseau de la MÊME session (routes produit gallery `_next/data` → puis `GET /pricing → 200`) | — | — |
| `*.metadata.json` | contexte de capture (url, horodatage, locale, cookies, viewport) | — | — |

## Vérification (recalcul par le relecteur)

```bash
sha256sum replit-gallery-dom.html   # == 4e5380a80312f45d59901e281f00a3a181d8ccf705e57c552e1704a0118be5a9
sha256sum replit-pricing-dom.html   # == f69b35f64d1cd3c16be25d4a25a148d43c1561703b2a2921356fac6ba572a957
grep -o 'href="/gallery/[^"]*"' replit-gallery-dom.html | wc -l   # 43 ancres routes produit (43 uniques)
grep -o '82<!-- --> Result<!-- -->s' replit-gallery-dom.html
# → 1 occurrence : le compteur « 82 Results » tel qu'il existe RÉELLEMENT dans
#   le DOM, éclaté par des nœuds commentaire React (<!-- -->). C'est la preuve
#   primaire de la leçon « 82 Result s » : innerText rend « 82 Results »,
#   le markup le stocke fragmenté.
python3 - <<'PY'
import re
h=open('replit-gallery-dom.html',encoding='utf-8').read()
t=re.sub(r'<[^>]+>',' ',re.sub(r'<!--.*?-->','',h))   # innerText approx. (commentaires retirés)
print('82 Results' in re.sub(r'\s+',' ',t))            # True
PY
grep -o '\$[0-9]\+' replit-pricing-dom.html | sort | uniq -c   # 2×$25, 2×$20, 2×$100, 1×$95
```

## Chaîne de provenance (pas d'auto-déclaration)

1. Le DOM a été sérialisé EN PAGE (`outerHTML`), son sha256 calculé EN PAGE par
   `crypto.subtle.digest('SHA-256', TextEncoder(html))` dans le MÊME appel.
2. Le DOM a été transporté par gzip (`CompressionStream`) + base64, décodé hors
   page, et son sha256 RECALCULÉ hors page : **identique octet pour octet** au
   hash calculé en page. Le fichier archivé ici EST cette donnée.
3. Les métadonnées (url, horodatage, locale fr-FR, cookies `gating_id`,
   `_dd_s`, `replit_consent`, `ajs_anonymous_id`) ont été lues dans le même
   contexte de page ; la trace réseau relie gallery et pricing à la même session.

## Ce que ce paquet prouve

- **Gallery** : `82 Results` (compteur réel, éclaté en nœuds DOM), 43 ancres de
  cartes `/gallery/` rendues (lazy-load), routes produit par catégories
  (work/life × productivity/businesses/entertainment/education/marketing-and-sales/finance)
  attestées par les requêtes `_next/data` de la trace réseau.
- **Pricing** : plans Starter / Core / Replit Pro / Enterprise dans le DOM ;
  prix `$25/$20` (Core mensuel/annualisé) et `$100/$95` (Pro) DANS le DOM
  archivé — reliés par la même session (cookies + trace réseau) à la locale
  fr-FR et à l'horodatage `2026-07-21T08:06:05.080Z`.

## Trous déclarés (honnêtes)

- Le « canal de lancement » (V4-1) n'apparaît PAS dans le rendu public de
  /gallery (aucune ancre ni texte « launch channel ») — seul un descriptif de
  carte contient le mot « launch ». Ce point reste À CAPTURER là où il existe
  (surface non identifiée dans le rendu public anonyme).
- Screenshot non inclus (le DOM complet + trace réseau sont les artefacts
  primaires ; un PNG peut être ajouté sur demande).
- Géolocalisation IP : la sortie géo-IP (IL/Netanya, paquet v3) n'est pas
  reliée par un artefact réseau à cette session précise — déclaré, pas affirmé.
