# Certification réelle bouton-par-bouton — Gallery app `storefront`

**App** : Meridian Supply Co. — Storefront (e-commerce full-stack : Express + Vite middleware + sql.js réel + Stripe test env-gated).
**Date** : 2026-07-24
**Méthode** : backend REEL démarré (`pnpm dev`, PORT=44180, Express + sql.js persisté sur `data/store.db`), piloté par un VRAI navigateur Chromium (Playwright headless) — clics/saisies réels, captures PNG et écoute `pageerror` + `console.error` à chaque étape. Endpoints backend sensibles vérifiés en direct (curl) et logique Stripe testée sur le module réel (`server/stripe.ts`).
**Base de données** : seed frais au 1er boot (10 produits), écritures réelles vérifiées, `store.db` = 28 KB sur disque.

## Résultat global

- **41 contrôles UI exercés au navigateur → 41 OK / 0 CASSÉ**
- **5 endpoints backend (edge/validation) → OK** (409 sur-stock, 200 OK, 404 produit/commande, 400 email)
- **4 cas de gating Stripe → OK** (aucune clé / `sk_live_` refus explicite / `sk_test_`+`pk_test_` accepté / `sk_test_` seul → non configuré)
- **0 `pageerror` JavaScript.** 1 `console.error` = message réseau du **409 volontaire** (refus de sur-stock) — comportement attendu, pas un défaut applicatif.
- **Aucune vue vide, aucun bouton sans effet, aucune donnée factice présentée comme réelle.** Bannière « read-only » **absente** (backend live). Persistance (commande + stock) vérifiée après reload.

## Tableau contrôle → résultat → preuve

### Catalogue
| Contrôle | Résultat | Preuve |
|---|---|---|
| Catalogue chargé depuis `/api/products` réel (10 cartes) | OK | `01-catalog.png` — 10 cartes, 0 err |
| Pas de bannière dégradée « read-only » (backend live) | OK | `.preview-banner` absent |
| Produit épuisé (`canvas-tool-roll` stock 0) → bouton « Sold out » désactivé | OK | `01-catalog.png` |
| Badges stock (In stock / Only N left / Out of stock) | OK | variantes rendues : In stock, Out of stock, Only 5 left, Only 3 left |
| Bouton « Add to cart » (carte catalogue) | OK | `02-catalog-added.png` — libellé « Added ✓ », panier=1 |
| Lien nom produit → fiche produit | OK | `03-product.png` — url `/product/brass-task-lamp` |
| Lien visuel produit → fiche produit | OK | url `/product/walnut-pen-tray` |

### Fiche produit
| Contrôle | Résultat | Preuve |
|---|---|---|
| Sélecteur de quantité | OK | qty=2 appliqué |
| Bouton « Add to cart » (qty 2) | OK | `04-product-added.png` — panier=3 |
| Bouton « ← All products » (retour) | OK | retour catalogue |
| Bouton « View cart » | OK | url `/cart` |

### Panier
| Contrôle | Résultat | Preuve |
|---|---|---|
| Sélecteur quantité de ligne → recalcule total ligne | OK | `05-cart-qty.png` — walnut 3×$54=$162, panier=4 |
| Total panier reflète toutes les lignes | OK | total=$350.00 (188+162) |
| Bouton « Remove » (supprime la ligne) | OK | `06-cart-removed.png` — 2→1 items |
| État panier vide → bouton « Browse the shop » | OK | `17-cart-empty.png` |

### En-tête / navigation
| Contrôle | Résultat | Preuve |
|---|---|---|
| Lien « Back office » | OK | `07-admin.png` — url `/admin` |
| Lien « Shop » | OK | catalogue |
| Logo marque → catalogue | OK | catalogue |
| Lien « Cart » + badge compteur | OK | badge=4 |

### Sur-stock (refus serveur)
| Contrôle | Résultat | Preuve |
|---|---|---|
| Checkout d'un panier > stock → **HTTP 409** + erreur visible | OK | `09-overstock-409.png` — « Only 1 of Wax Seal Stamp left in stock. » |
| `POST /api/cart/validate` sur-stock → 409 | OK | `{"error":"Only 40 left in stock.","stock":40}` HTTP 409 |
| `POST /api/cart/validate` valide → 200 | OK | `{"ok":true,"stock":40}` HTTP 200 |

### Checkout & commande (chemin « unpaid » RÉEL)
| Contrôle | Résultat | Preuve |
|---|---|---|
| Bouton submit désactivé tant que l'email est invalide | OK | désactivé si email vide |
| Notice « Card payments are not connected » (Stripe env-gated, honnête) | OK | `10-checkout-form.png` |
| Résumé de commande liste les articles | OK | 2 lignes |
| Email valide → active le bouton submit | OK | activé |
| « Place unpaid test order » → **vraie commande UNPAID** créée | OK | `11-order.png` — ref `MSC-WUEVMT1Q`, mode=unpaid |
| Page commande : statut Unpaid + référence + email | OK | `11-order.png` — statut « Unpaid », total $314 |
| Panier vidé après commande | OK | badge=0 |
| Bouton « View in back office » → commande listée en admin | OK | `12-admin-order.png` |
| Bouton « Continue shopping » | OK | catalogue |
| `POST /api/checkout` email invalide → 400 | OK | HTTP 400 « A valid email address is required. » |
| `GET /api/orders/:ref` inconnu → 404 | OK | HTTP 404 |
| `GET /api/products/:id` inconnu → 404 | OK | HTTP 404 |

### Back-office (écritures réelles en base)
| Contrôle | Résultat | Preuve |
|---|---|---|
| Bouton stock « +1 » | OK | 5→6 |
| Bouton stock « −1 » | OK | 6→5 |
| Champ « set » stock (commit au blur) | OK | `08-admin-set-stock.png` — stamp=1 |
| Champ « set » stock (commit sur Enter) | OK | `13-admin-set-mug.png` — mug=99 |
| Bouton « Disable » produit | OK | `14-admin-disabled.png` — badge « Hidden » |
| Produit désactivé → disparaît du catalogue storefront | OK | `15-catalog-hidden.png` — 0 carte Oak Desk Caddy |
| Bouton « Enable » → réapparaît au catalogue | OK | 1 carte restaurée |
| Bouton « View storefront » | OK | catalogue |

### Persistance (survie au reload)
| Contrôle | Résultat | Preuve |
|---|---|---|
| Changement de stock (mug=99) survit au reload | OK | `16-persist-admin.png` — mug=99 après reload |
| Commande `MSC-WUEVMT1Q` survit au reload | OK | toujours listée en admin après reload |
| `data/store.db` écrit sur disque | OK | 28 KB |

### Stripe (env-gated — vérifié sur le module réel `server/stripe.ts`)
| Contrôle | Résultat | Preuve |
|---|---|---|
| Aucune clé → client null, `configured:false` (chemin unpaid utilisé) | OK | `client: null` |
| `sk_live_…` → **refus explicite** `StripeConfigError` | OK | « Refusing STRIPE_SECRET_KEY: this demo accepts TEST mode keys only (sk_test_…). » |
| `sk_test_…` + `pk_test_…` → client Stripe réel, `configured:true`, publishable exposée | OK | `{"configured":true,"publishableKey":"pk_test_…"}` |
| `sk_test_…` seul (sans publishable) → `configured:false` | OK | `{"configured":false,"publishableKey":null}` |

## Chemin NON testé (déclaré honnêtement)
Le **paiement carte réussi via Payment Element** n'a **PAS** été exercé : il nécessite `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` de test que nous n'avons pas. Ce n'est **pas un mode dégradé** — la logique serveur (création `PaymentIntent`, confirmation `redirect:'if_required'`, vérification `intent.status==='succeeded'` avant `settleOrderPaid`) existe et le gating est prouvé ci-dessus. Catalogue / panier / commande UNPAID / stock / admin / persistance sont **100 % réels et prouvés**. Aucun paiement réussi n'est prétendu.

## Corrections apportées
**Aucune.** Tous les contrôles fonctionnent à 100 % au premier passage. Deux « BROKEN » du run préliminaire étaient des **assertions erronées du script de test** (données de panier mal supposées), pas des défauts de l'app ; corrigées dans le script, le run définitif est 41/41 OK. Aucune modification du code de `dev-storefront/` n'a été nécessaire.

## Régénération du module repo + validation officielle
Le code source `dev-storefront/` n'ayant pas été modifié, le module repo `packages/template-catalog/src/apps/storefront.ts` n'a **pas** eu besoin d'être régénéré. La **validation officielle a été lancée SANS `--skip-install`** pour prouver que le module commité tourne :

```
[gallery] storefront (1/1)
[gallery] 1/1 passed
[gallery] report .../runtime/gallery-demo-app-validation-storefront.json
```

## VERDICT : **COMPLET**

41/41 contrôles UI OK, 0 `pageerror`, backend 100 % réel (aucun mode dégradé masqué), persistance vérifiée, refus de sur-stock (409) et gating Stripe (`sk_live_` refusé) prouvés, aucune sur-revendication (paiement carte réussi non testé et déclaré comme tel), validation officielle `[gallery] 1/1 passed`.
