const IMPORT_MARKER = 'VIBECORE_PACKAGE_IMPORT_OK';

/** Check the package installed by the UI. Never install, retry, or use an API-local fallback. */
export async function verifyInstalledAuditPackage({ apiBaseUrl, token, projectId, panel, fetchImpl = fetch }) {
  const workspaceId = panel?.data?.workspace?.id;
  const run = panel?.data?.packagesState?.runs?.[0];

  if (
    typeof workspaceId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId) ||
    panel?.data?.project?.id !== projectId ||
    run?.intent !== 'install-package' ||
    run?.status !== 'succeeded' ||
    run?.exitCode !== 0 ||
    run?.termination ||
    !Array.isArray(run?.packages) ||
    !run.packages.includes('is-odd')
  ) {
    throw new Error('Package import verification requires the reloaded successful install and its actual workspace');
  }

  const args = [
    '-e',
    `const isOdd = require('is-odd'); if (typeof isOdd !== 'function' || isOdd(3) !== true || isOdd(4) !== false) process.exit(23); process.stdout.write('${IMPORT_MARKER}');`,
  ];

  let response;
  let result;

  try {
    response = await fetchImpl(
      `${apiBaseUrl.replace(/\/$/, '')}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'node', args, timeoutMs: 10_000 }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Package import command was rejected');
    }

    result = await response.json();
  } catch {
    // Do not retain arbitrary network errors, output, workspace identifiers, or tokens.
    throw new Error('Package import verification did not return a confirmed runtime result; it was not retried');
  }

  if (result?.exitCode !== 0 || result?.localRuntime !== false || result?.output !== IMPORT_MARKER) {
    throw new Error('Package import verification failed in the installed workspace');
  }

  return { importVerified: true };
}
