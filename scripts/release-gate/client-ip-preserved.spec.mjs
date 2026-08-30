/**
 * SEC-RATE-001 — l'IP source du client doit survivre jusqu'à l'API.
 *
 * Mesuré en production le 2026-08-30 : 60 tentatives de connexion depuis un seul
 * client en 21 s, 56 traitées pour un plafond de 10.
 *
 * Cause prouvée à deux niveaux. nginx journalise ses clients comme
 * 10.10.15.212…217 — les IP des NŒUDS GKE — pour la totalité des requêtes, et la
 * table AuditLog enregistre ces mêmes IP. Avec `externalTrafficPolicy: Cluster`,
 * kube-proxy fait du SNAT dès qu'un paquet franchit un nœud : l'adresse du
 * client est remplacée AVANT nginx.
 *
 * Conséquence : le compteur Redis était indexé sur six IP de nœuds au lieu d'une
 * IP d'appelant. Les quotas ne protégeaient rien, et deux clients derrière un
 * même nœud partageaient un compartiment — un abuseur pouvait faire refuser la
 * connexion à des utilisateurs légitimes.
 *
 * Ce test lit le fichier de values COMMENTAIRES RETIRÉS : la prose ci-dessus
 * cite `Cluster`, et un test qui lit ses propres commentaires ne prouve rien.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const VALUES = path.join(process.cwd(), 'infra/helm/ingress-nginx/values-prod.yaml');
const RAW = fs.readFileSync(VALUES, 'utf8');
const CODE = RAW.split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const API = path.join(process.cwd(), 'services/api/src/app.ts');
const API_SOURCE = fs.readFileSync(API, 'utf8');

describe('SEC-RATE-001 — l’IP du client atteint le limiteur', () => {
  it('préserve l’IP source au niveau du service d’entrée', () => {
    expect(CODE).toMatch(/externalTrafficPolicy:\s*Local/);
    expect(CODE).not.toMatch(/externalTrafficPolicy:\s*Cluster/);
  });

  it('garde l’IP statique du LB, dont dépend tout le DNS', () => {
    // La perdre couperait e-code.ai, app.e-code.ai et api.e-code.ai d'un coup.
    expect(CODE).toMatch(/loadBalancerIP:\s*34\.1\.6\.93/);
  });

  it('conserve deux replicas sur deux nœuds distincts', () => {
    /*
     * `Local` ne route que vers les nœuds portant un pod. Avec un seul replica,
     * le LB n'aurait qu'un backend et la perte du pod couperait tout le trafic.
     * L'anti-affinité `required` garantit les deux nœuds distincts.
     */
    expect(CODE).toMatch(/replicaCount:\s*([2-9]|\d{2,})/);
    expect(CODE).toMatch(/requiredDuringSchedulingIgnoredDuringExecution/);
  });

  it('indexe le compteur anonyme sur l’IP, seul signal non falsifiable', () => {
    // La clé était déjà correcte : c'est `request.ip` qui mentait, pas le
    // générateur de clé. On fige la forme pour qu'un remaniement ne replie pas
    // le compteur sur un en-tête que le client contrôle.
    expect(API_SOURCE).toMatch(/rateLimitKeyPrefix\}:ip:\$\{request\.ip\}/);
  });

  it('exige TRUST_PROXY pour lire l’en-tête que nginx écrira', () => {
    /*
     * `Local` redonne à nginx la vraie IP ; encore faut-il que l'API lise
     * l'en-tête plutôt que l'adresse de socket du pod nginx. Un seul saut de
     * confiance : faire confiance à toute la chaîne laisserait un client forger
     * son adresse.
     */
    expect(API_SOURCE).toMatch(/trustProxyEnv === 'true'\s*\?\s*1/);
  });
});
