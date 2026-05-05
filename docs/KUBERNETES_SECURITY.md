# Kubernetes Security

## Isolation Pod

Les Pods workspace générés par `packages/k8s-client` et illustrés dans `infra/kubernetes/workspaces-runtime/example-workspace-pod.yaml` appliquent:

- `runtimeClassName: gvisor`
- `runAsNonRoot: true`
- `runAsUser: 1000`
- `fsGroup: 1000`
- `seccompProfile: RuntimeDefault`
- `allowPrivilegeEscalation: false`
- `privileged: false`
- `capabilities.drop: [ALL]`
- `automountServiceAccountToken: false`
- pas de `hostNetwork`
- pas de `hostPID`
- pas de `hostPath`
- pas de Docker socket

## Réseau

Les NetworkPolicies dans `infra/kubernetes/workspaces-runtime/networkpolicies.yaml` appliquent:

- deny-all ingress/egress par défaut;
- DNS autorisé vers `kube-system`;
- egress HTTPS contrôlé vers les registries/packages;
- blocage metadata server `169.254.169.254/32`;
- blocage réseaux privés plateforme `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`;
- ingress autorisé uniquement depuis `workspace-manager` vers l'agent;
- ingress autorisé depuis `preview-proxy` vers les ports preview.

## Secrets

Le manager ne monte que les secrets explicitement autorisés dans la demande de démarrage. Les tokens SCIM/API/org/projet ne doivent jamais être injectés par défaut. Les secrets runtime doivent être fournis via `allowedSecrets` ou référencés explicitement via `allowedSecretKeys`.

## Agent

`workspace-agent` vérifie un bearer token signé court terme par `packages/workspace-sdk`. L'agent force tous les chemins sous `/workspace`, limite la taille des fichiers, limite les sorties de commande, applique un timeout de commande et limite le nombre de processus suivis.

## À valider sur cluster réel

- gVisor doit être installé sur le pool sandbox.
- Les labels de pods `workspace-manager` et `preview-proxy` doivent correspondre aux NetworkPolicies.
- Le CNI doit supporter les NetworkPolicies et les `ipBlock.except`.
- Les registries autorisés doivent être resserrés en CIDR/domaines selon le fournisseur réseau.
