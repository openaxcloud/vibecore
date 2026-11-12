import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
// eslint-disable-next-line no-restricted-imports -- Reuse the CI artifact credential filter.
import { redactRuntimeEvidence } from '../../scripts/ci/runtime-evidence-redaction.mjs';

const MAX_BYTES = 64 * 1024;
const TIMEOUT = 2_000;

const credentialKeys = [
  'WORKSPACE_AGENT_TOKEN_SECRET',
  'WORKSPACE_MANAGER_SHARED_SECRET',
  'PREVIEW_PROXY_SHARED_SECRET',
];

export function commandEvidenceJson(output: string | undefined, credentials: string[]): string {
  if (output === undefined) {
    return JSON.stringify({ available: false });
  }

  /*
   * Redact the complete text before truncation, including credentials crossing
   * the retained boundary. Bound the serialized JSON, not only its text field.
   */
  const clean = redactRuntimeEvidence(output, credentials);

  const serialize = (length: number) =>
    JSON.stringify({ available: true, truncated: length < clean.length, output: clean.slice(clean.length - length) });

  let low = 0;
  let high = clean.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (Buffer.byteLength(serialize(middle)) <= MAX_BYTES) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return serialize(low);
}

/** Best-effort existing UI diagnostics only; never changes test assertions. */
export async function capturePreviewCommandEvidence(page: Page, outputPath: string): Promise<void> {
  let output: string | undefined;

  try {
    const panel = page.locator('.bolt-preview-logs-panel');

    if (!(await panel.isVisible())) {
      await page.getByTitle('Webview logs', { exact: true }).click({ timeout: TIMEOUT });
    }

    await panel.getByRole('tab', { name: 'Server logs', exact: true }).click({ timeout: TIMEOUT });
    output = await panel.locator('pre').innerText({ timeout: TIMEOUT });
  } catch {
    // Closed/missing UI must not leak error messages, URLs or network details.
    output = undefined;
  }

  const credentials = credentialKeys.map((key) => process.env[key]).filter((value): value is string => Boolean(value));

  try {
    await writeFile(outputPath, commandEvidenceJson(output, credentials));
  } catch {
    // Diagnostics must not replace the actual runtime verdict or prevent cleanup.
  }
}
