/**
 * AUDX-012 (volet « rôles de base par service ») — matrice des tables que chaque
 * service atteint réellement.
 *
 * Aujourd'hui les cinq services partagent UNE seule chaîne `DATABASE_URL`, donc
 * UN seul rôle PostgreSQL avec accès à la totalité du schéma. Mesuré :
 *
 *     api ................. 106 modèles sur 122
 *     worker ..............   7
 *     ai-gateway ..........   6
 *     connector-proxy .....   6
 *     workspace-manager ...   1
 *
 * `workspace-manager` touche UNE table et peut lire et écrire les 121 autres —
 * `User.passwordHash`, `Session`, et chaque colonne `*Enc` de secrets chiffrés.
 *
 * ⚠️ CE SCRIPT NE CRÉE AUCUN RÔLE ET N'APPLIQUE AUCUN GRANT. Il produit la
 * matrice et la compare à ce qui est déclaré, rien de plus. La création des
 * rôles est une opération Cloud SQL, hors dépôt.
 *
 * ⚠️ ET LA MATRICE EST DÉRIVÉE D'UNE ANALYSE STATIQUE, donc faillible dans le
 * sens dangereux : un accès qu'elle ne voit pas devient un GRANT manquant, donc
 * une panne. Ce piège s'est produit trois fois pendant cette passe —
 * `CONFIG_ENCRYPTION_KEY` lu transitivement via `packages/security`, les secrets
 * OAuth lus par nom calculé, et `ProviderConfig` atteint par
 * `sharedGatewayDbClient.providerConfig` et non par `prisma.providerConfig`.
 * Le motif ci-dessous est donc volontairement AGNOSTIQUE DU RÉCEPTEUR.
 *
 * Aucun grant ne doit être appliqué avant d'avoir fait tourner chaque service
 * sur un environnement de recette avec le rôle restreint : c'est la seule preuve
 * qui vaille, et elle n'est pas dans ce dépôt.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('../..', import.meta.url).pathname);

/** Services that open their own connection, and the role each would use. */
export const SERVICE_ROLES = [
  { service: 'api', dir: 'services/api/src', role: 'vibecore_api' },
  { service: 'worker', dir: 'services/worker/src', role: 'vibecore_worker' },
  { service: 'ai-gateway', dir: 'services/ai-gateway/src', role: 'vibecore_ai_gateway' },
  { service: 'connector-proxy', dir: 'services/connector-proxy/src', role: 'vibecore_connector_proxy' },
  { service: 'workspace-manager', dir: 'services/workspace-manager/src', role: 'vibecore_workspace_manager' },
];

const PRISMA_OPS = [
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
].join('|');

function sourceFiles(dir) {
  const full = join(repoRoot, dir);
  let entries;

  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }

  const found = [];

  for (const entry of entries) {
    const path = join(full, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(join(dir, entry)));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      found.push(path);
    }
  }

  return found;
}

export function schemaModels(schemaText = readFileSync(join(repoRoot, 'packages/database/prisma/schema.prisma'), 'utf8')) {
  return [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

/** Models a service reaches, by ANY client variable name. */
export function modelsReachedBy(dir, models) {
  const text = sourceFiles(dir)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  return models.filter((model) => {
    const delegate = model.charAt(0).toLowerCase() + model.slice(1);

    /*
     * Receiver-agnostic on purpose: the ai-gateway calls
     * `sharedGatewayDbClient.providerConfig.findMany(...)`. A pattern anchored on
     * `prisma.` missed it, and a grant matrix built from that pattern would have
     * removed the gateway's access to the table holding the provider API keys.
     */
    return new RegExp(`\\.${delegate}\\.(${PRISMA_OPS})\\s*\\(`).test(text);
  });
}

export function buildMatrix() {
  const models = schemaModels();

  return SERVICE_ROLES.map((entry) => ({
    ...entry,
    models: modelsReachedBy(entry.dir, models),
    totalModels: models.length,
  }));
}

/** Least-privilege GRANTs, for REVIEW — never executed by this script. */
export function grantSql(matrix) {
  const lines = [
    '-- AUDX-012 — GRANTs par service, GÉNÉRÉS depuis une analyse statique.',
    '--',
    '-- ⚠️ NE PAS APPLIQUER TEL QUEL. Un accès que l’analyse ne voit pas devient',
    '-- ici un GRANT manquant, donc une panne en production. Faire tourner chaque',
    '-- service sur une recette avec son rôle restreint AVANT toute application.',
    '--',
    '-- Les rôles eux-mêmes se créent côté Cloud SQL, hors dépôt.',
    '',
  ];

  for (const entry of matrix) {
    lines.push(`-- ${entry.service} : ${entry.models.length} table(s) sur ${entry.totalModels}`);
    lines.push(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${entry.role};`);

    for (const model of entry.models) {
      lines.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${model}" TO ${entry.role};`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const matrix = buildMatrix();

  for (const entry of matrix) {
    console.log(`  ${entry.service.padEnd(20)} ${String(entry.models.length).padStart(3)} / ${entry.totalModels} tables`);
  }

  if (process.argv.includes('--sql')) {
    console.log(`\n${grantSql(matrix)}`);
  }
}
