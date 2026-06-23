/*
 * Server-free helper for the account-data export route. Kept in ~/lib so the
 * route module (which imports `*.server`) can export only its loader.
 */

/**
 * Build a raw JSON download Response for the account-data export.
 *
 * This must be a real `Response` (not the framework's `json`/`data` helper):
 * under single-fetch, `data()` returns a DataWithResponseInit sentinel that the
 * framework serializes as turbo-stream, so the saved file would NOT be parseable
 * JSON. Mirror agent-memory-export-response.ts and stream a genuine JSON body.
 *
 * The download filename uses the brand-neutral `ecode-account-export-<iso>.json`
 * convention (the product brand is E-Code) rather than leaking the internal
 * `vibecore` codename into the user's Downloads folder.
 */
export function buildAccountExportResponse(payload: unknown, now: Date = new Date()): Response {
  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="ecode-account-export-${now.toISOString()}.json"`,
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  });
}
