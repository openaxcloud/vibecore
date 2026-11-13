import { constants } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const tailLimit = 1024 * 1024;

const knownCodes = [
  'WORKSPACE_MANAGER_UNAVAILABLE',
  'WORKSPACE_MANAGER_REQUEST_FAILED',
  'WORKSPACE_AGENT_TOKEN_SECRET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EADDRINUSE',
  'QUOTA_EXCEEDED',
  'INSUFFICIENT_CREDITS',
  'RUNTIME_E2E_PREFLIGHT_API_UNAVAILABLE',
  'RUNTIME_E2E_PREFLIGHT_WORKSPACE_MANAGER_UNAVAILABLE',
] as const;

/** Closed vocabulary: no arbitrary log text, URLs, keys, user content or headers leave the runner. */
export function summarizeRuntimeLog(text: string) {
  return {
    codes: knownCodes
      .map((code) => ({ code, occurrences: text.split(code).length - 1 }))
      .filter((entry) => entry.occurrences > 0),
    http5xx: [...text.matchAll(/"statusCode"\s*:\s*(5[0-9]{2})\b/g)].map((match) => Number(match[1])),
    rawContentIncluded: false,
  };
}

export async function collectRuntimeDiagnostics(directory = 'runtime-diagnostics', sourceDirectory = '/tmp') {
  await mkdir(directory, { recursive: true });

  const services = [];

  for (const service of ['api', 'web', 'admin', 'workspace-manager', 'runtime-preflight']) {
    let file;

    try {
      file = await open(`${sourceDirectory}/vibecore-${service}.log`, constants.O_RDONLY | constants.O_NOFOLLOW);

      const info = await file.stat();

      if (!info.isFile()) {
        throw new Error('not a file');
      }

      const buffer = Buffer.alloc(Math.min(info.size, tailLimit));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, info.size - tailLimit));
      services.push({
        service,
        available: true,
        bytesInspected: bytesRead,
        truncated: info.size > tailLimit,
        ...summarizeRuntimeLog(buffer.subarray(0, bytesRead).toString('utf8')),
      });
    } catch {
      services.push({ service, available: false });
    } finally {
      await file?.close();
    }
  }
  await writeFile(
    `${directory}/services.json`,
    JSON.stringify(
      {
        event: 'RUNTIME_E2E_DIAGNOSTICS',
        scope: 'last 1MiB per service, known error codes only; absence of codes is not health proof',
        services,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await collectRuntimeDiagnostics();
}
