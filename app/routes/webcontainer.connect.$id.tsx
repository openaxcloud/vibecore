import { webContainerConnectModuleUrl } from '@vibecore/runtime-webcontainer';
import { type LoaderFunction } from 'react-router';

const DEFAULT_EDITOR_ORIGIN = 'https://stackblitz.com';

/*
 * The raw `editorOrigin` query param is embedded into an inline <script> served
 * from our own origin, so it must never be trusted verbatim (else it is a
 * reflected XSS — an attacker can break out of the JS string literal). Accept
 * only a well-formed http(s) ORIGIN and canonicalise it; anything else falls back
 * to the default. We additionally JSON-encode it at the embed site.
 */
function safeEditorOrigin(raw: string | null): string {
  if (!raw) {
    return DEFAULT_EDITOR_ORIGIN;
  }

  try {
    const parsed = new URL(raw);

    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin === raw) {
      return parsed.origin;
    }
  } catch {
    // fall through
  }

  return DEFAULT_EDITOR_ORIGIN;
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const editorOrigin = safeEditorOrigin(url.searchParams.get('editorOrigin'));

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Connect to WebContainer</title>
      </head>
      <body>
        <script type="module">
          (async () => {
            const { setupConnect } = await import('${webContainerConnectModuleUrl}');
            setupConnect({
              editorOrigin: ${JSON.stringify(editorOrigin)}
            });
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(htmlContent, {
    headers: { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff' },
  });
};
