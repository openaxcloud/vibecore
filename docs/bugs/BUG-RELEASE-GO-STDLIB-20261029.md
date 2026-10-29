---
id: BUG-RELEASE-GO-STDLIB-20261029
---

## Bug

Le gate « Vulnerability gate + SBOM exact digests » du déploiement 40751950616 a refusé la livraison de `63e66383055c632865b7ebd27df19aa1a6f6f37f`. Helm, rollout et vérification imageIDs n'ont pas été exécutés. L'archive fournie par l'utilisateur a été analysée dans la session de coordination ; son empreinte SHA256 est `794edfd62dc54634279233253c165cf5888ae6b7bb95675c5e77679799482bda` (2 080 354 octets). Les champs transmis attestent neuf rapports valides, neuf SBOM avec sortie zéro, et sept scans critiques avec sortie un : il ne s'agit pas d'une panne du scanner.

## 📤 Dispatché

☑ 29/10/2026 — diagnostic sécurité et correction des dépendances embarquées ; aucune exclusion de scanner ni baisse de seuil.

## 💻 Codé

☐ main — correctif en préparation dans l'assemblage #847 + #846, non fusionné et non livré.

## ✅ Testé live

☐ production — les images finales corrigées doivent encore être construites et scannées par leur empreinte exacte avant tout rollout.

## Cause établie

Les six images admin, aiGateway, api, previewProxy, worker et workspaceManager signalent `usr/local/bin/kubectl`, stdlib Go v1.25.7. L'image web signale `app/node_modules/.pnpm/@typescript+typescript-linux-x64@7.0.2/node_modules/@typescript/typescript-linux-x64/lib/tsc`, Go v1.26.4. Chaque rapport contient uniquement CVE-2026-56857 comme vulnérabilité critique ; screenshotter et workspaceAgent n'en contiennent aucune.

L'[avis officiel Go GO-2026-6604](https://pkg.go.dev/vuln/GO-2026-6604) décrit une sortie de racine par jonction Windows et fixe les bornes corrigées à Go 1.26.9 / 1.27.2. La [fiche CNA Go](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2026/56xxx/CVE-2026-56857.json) limite explicitement les plateformes affectées à Windows. Le défaut décrit n'est donc pas applicable aux binaires Linux observés ; cela ne justifie pas de désactiver le gate fondé sur les versions embarquées, et ne prouve pas l'absence de toute autre vulnérabilité.

## Correction et vérifications

Le client kubectl reste dans la série 1.35 et passe à v1.35.10 ; les mêmes URL officielles, vérification SHA256, permissions du binaire et commandes d'exécution sont conservées. Kubernetes confirme [Go 1.26.10 dans cette version](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.35.10/.go-version). Le binaire Linux/amd64 téléchargé localement a été contrôlé contre le SHA256 officiel `c49a28f1f4efc4d475ed05f47f2ce8e563bf7bef69ed77fe1b924ea6d83b6327` ; `version --client -o json` confirme v1.35.10 / Go 1.26.10. Sept contrats CLI hors ligne couvrent les options employées par le produit ; les 119 tests du paquet k8s-client passent. Aucun appel à un cluster ni changement de droits.

kubectl demeure requis par workspace-manager pour les workspaces, déploiements, logs et capacité ; il n'est pas supprimé arbitrairement de l'image partagée. La version effective du serveur Kubernetes n'a pas été interrogée ; conserver la même version mineure évite d'élargir l'écart client/serveur existant.

Le compilateur natif web est retenu via des peers optionnels Prisma/Valibot. Un script dédié retire uniquement cette distribution native et ses liens après avoir refusé les consommateurs obligatoires, y compris alias npm et dépendances workspace. Les distributions TypeScript JavaScript sont conservées ; le marcheur historique et le contrôle positif de démarrage restent inchangés. La suppression intervient après le build, jamais dans l'environnement de génération des projets utilisateurs.

Contre-épreuve sur copie fraîche : compilateur présent avant ET après `pnpm prune --prod --ignore-scripts` ; retrait de deux paquets et quatre liens par le helper ; marcheur historique terminé sans erreur (1 487 entrées atteignables, dix mortes retirées) ; compilateur natif et wrapper absents ; serveur SSR réel répondant `/health` en HTTP 200. Le CLI Prisma physique restant exécute `--version` avec succès et signale TypeScript JavaScript 5.8.3. Le CLI physique valide aussi le vrai schéma après prune/retrait, sans connexion base. La validation avec le fichier de configuration workspace échoue après prune sur `prisma/config` absent ; ce lien disparaît déjà dans le témoin avant notre helper. Une copie indépendante sans prune a validé configuration et schéma après retrait. Cette différence est conservée comme limite, sans réparation artificielle des liens. Le lien CLI `packages/database/node_modules/prisma` disparaît déjà lors du prune témoin avant le helper ; le hook de migration utilise l'image API distincte, non modifiée par ce retrait web.

Les 14 contrats du helper et huit du marcheur passent, ainsi que 55 tests de câblage/base système, 77 contrats release/manifeste/migrations et 16 tests d'inventaire. La revue indépendante a fait corriger le cas des alias obligatoires avant publication. Aucun compilateur n'est supprimé silencieusement si un consommateur obligatoire résolu en dépend.

## Limites

Trivy 0.72.0 a été téléchargé et vérifié contre l'empreinte du workflow. Son analyse locale n'a pas commencé : téléchargement de base refusé par le proxy sur `https://mirror.gcr.io/v2/` (403). Aucun autre registre, proxy ou transfert d'archive n'a été tenté. Ce refus ne vaut pas scan réussi. Les neuf images exactes doivent passer le gate normal GitHub après reconstruction ; aucune dérogation n'est ajoutée.
