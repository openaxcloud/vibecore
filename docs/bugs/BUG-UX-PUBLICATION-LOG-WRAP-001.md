---
id: BUG-UX-PUBLICATION-LOG-WRAP-001
---

# Les actions d’une publication échouée compriment leurs libellés en français

## 📤 Dispatché

Audit UX local du 21 octobre 2026 après reprise complète de ide-mobile-chrome.spec.ts. Ce cas était omis par timeout dans le gate #748 ; il n’est pas l’un des deux échecs initiaux Git/Sécurité/Base de données.

## 💻 Codé

Correction préparée : flex-wrap sur le seul groupe .bolt-publication-echec-actions. Les boutons passent à la ligne lorsque leur largeur naturelle dépasse celle du groupe. Aucun changement de texte, d’action, de règle de sécurité ou du moteur BaseChat/layout.

## ✅ Testé live

Avant : 44/45 tests locaux, sans retry ni omission. À 390×844 FR, Voir les journaux est mesuré à 116,7×44px et occupe deux lignes ; capture sur le projet synthétique persistant, données API réelles. Les deux tests SQL réels et les deux cas initialement rouges CI passent. La connexion fournisseur/déploiement effectif n’est pas certifiée : le déploiement synthétique échoue localement et sert à exercer l’état d’erreur et ses journaux.

Après correction : 45/45 cas passent sans retry ni omission sur API #748 exacte et build compilé `241de187…`, dont l’assertion initialement rouge inchangée.

Les preuves avant/après, la configuration, les versions API/front et les limites sont consignées dans [la recette du gate mobile](ux-mobile-gate-2026-10-21/README.md). Aucune validation production ni certification de panneau complet.
