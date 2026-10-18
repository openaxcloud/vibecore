import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Phase one installs quota readers. Activating reservations is a separate release. */
export function verifyWorkspaceAdmissionPhase(configmap) {
  for (const [name, expected] of [
    ['WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'true'],
    ['WORKSPACE_ADMISSION_V2_ENABLED', 'false'],
  ]) {
    if (configmap?.data?.[name] !== expected) {
      throw new Error(`Workspace admission phase mismatch: ${name}; deployment refused.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path] = process.argv.slice(2);

    if (!path) {
      throw new Error('Expected the live ConfigMap JSON path.');
    }

    verifyWorkspaceAdmissionPhase(JSON.parse(readFileSync(path, 'utf8')));
    console.log('Workspace admission phase one verified: quota reader on, reservations off.');
  } catch (error) {
    // Never echo the input JSON, which can contain unrelated configuration.
    console.error(error instanceof SyntaxError ? 'Unreadable ConfigMap; deployment refused.' : error.message);
    process.exitCode = 1;
  }
}
