import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const protectionsRequises = Object.freeze([
  'platformEnv.adminMfaRequired',
  'platformEnv.aiGatewayRequireAuth',
  'database.sharedCluster.enabled',
  'global.marketingWwwRedirect',
]);

/** Lit uniquement les quatre interrupteurs publics, jamais une valeur de secret. */
export function verifierProtectionsProduction(release) {
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    throw new Error('Valeurs de la release vivante illisibles. Livraison refusée.');
  }

  const absentesOuCoupees = protectionsRequises.filter((chemin) => {
    const valeur = chemin.split('.').reduce((objet, cle) => objet?.[cle], release);
    return valeur !== true && valeur !== 'true';
  });

  if (absentesOuCoupees.length) {
    throw new Error(
      `Protections absentes ou coupées dans la release vivante : ${absentesOuCoupees.join(', ')}. Livraison refusée.`,
    );
  }
}

export function verifierConfigMapProduction(configmap) {
  for (const cle of ['ADMIN_MFA_REQUIRED', 'AI_GATEWAY_REQUIRE_AUTH']) {
    if (configmap?.data?.[cle] !== 'true') {
      throw new Error(`${cle} absent ou coupé dans le ConfigMap vivant. Livraison refusée.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [chemin, configmap] = process.argv.slice(2);
    if (!chemin) throw new Error('Usage : verifier-protections-production.mjs <release.json> [configmap.json]');
    verifierProtectionsProduction(JSON.parse(readFileSync(chemin, 'utf8')));
    if (configmap) verifierConfigMapProduction(JSON.parse(readFileSync(configmap, 'utf8')));
    console.log('Les quatre protections de production sont actives.');
  } catch (erreur) {
    // Une erreur de parsing peut citer le JSON source, donc ne pas la recopier.
    console.error(erreur instanceof SyntaxError ? 'JSON vivant illisible. Livraison refusée.' : erreur.message);
    process.exitCode = 1;
  }
}
