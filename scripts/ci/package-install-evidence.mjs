/** Failure-only evidence. Never retain command output, URLs, IDs, or arbitrary messages. */
export async function packageInstallFailure(response) {
  const status = response.status();

  const evidence = {
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    bodyRead: 'unavailable',
  };

  let timer;

  try {
    const declaredLength = response.headers?.()['content-length'];

    /*
     * Skip a declared oversize body before requesting it. Missing/compressed or
     * inaccurate lengths are not a read-memory bound: text() still materializes
     * the response. The post-read size check only limits parsing and retention.
     */
    if (typeof declaredLength === 'string' && /^\d+$/.test(declaredLength) && Number(declaredLength) > 65_536) {
      evidence.bodyRead = 'declared-oversized';
    } else {
      const text = await Promise.race([
        response.text(),
        new Promise((resolve) => {
          // This bounds waiting only; it does not cancel response.text().
          timer = setTimeout(() => resolve(null), 1000);
        }),
      ]);

      if (typeof text === 'string' && Buffer.byteLength(text, 'utf8') <= 65_536) {
        const body = JSON.parse(text);
        evidence.bodyRead = 'read';
        evidence.code = ['PACKAGE_RUN_FAILED', 'PACKAGE_RUN_OUTCOME_UNKNOWN'].includes(body?.code)
          ? body.code
          : 'other';
        evidence.exitCode =
          Number.isInteger(body?.run?.exitCode) && body.run.exitCode >= -1 && body.run.exitCode <= 255
            ? body.run.exitCode
            : null;
        evidence.outcome =
          evidence.code === 'PACKAGE_RUN_OUTCOME_UNKNOWN' || evidence.exitCode === null || evidence.exitCode === -1
            ? 'unknown'
            : evidence.exitCode !== 0
              ? 'failed'
              : 'rejected';

        // These are only reported cause hints, never proof of a root cause.
        const message = typeof body?.error === 'string' ? body.error : '';
        evidence.reportedErrorCode =
          [
            'EAI_AGAIN',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOSPC',
            'EACCES',
            'ERESOLVE',
            'E404',
            'E401',
            'E403',
          ].find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? 'unclassified';
      }
    }
  } catch {
    // An unavailable diagnostic must never mask the original failed HTTP response.
  } finally {
    clearTimeout(timer);
  }

  return new Error(`Package installation did not succeed: ${JSON.stringify(evidence)}`);
}
