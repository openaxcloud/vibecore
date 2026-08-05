import { type ActionFunctionArgs } from 'react-router';
import { preferredConnectorToken } from '~/lib/connectors/connector-token.server';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import type { NetlifySiteInfo } from '~/types/netlify';

/*
 * All outbound Netlify API calls go through this so a hung upstream can't pin the
 * request handler indefinitely. Preserves any explicitly-passed signal.
 */
function timeoutFetch(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
}

interface DeployRequestBody {
  siteId?: string;
  files: Record<string, string>;
  chatId: string;
}

async function sha1(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const {
      siteId,
      files,
      token: fallbackToken,
      chatId,
    } = (await request.json()) as DeployRequestBody & {
      token: string;
    };

    /*
     * Prefer the cross-device UserConnection token (decrypted server-side for the
     * authenticated owner) over the bolt localStorage token the browser sent, so a
     * user who connected Netlify on another device can deploy here without
     * reconnecting. Falls back to the supplied token cleanly.
     */
    const token = await preferredConnectorToken(request, 'netlify', fallbackToken);

    if (!token) {
      return webApiErrorResponse(request, 'NETLIFY_TOKEN_MISSING', 401);
    }

    let targetSiteId = siteId;
    let siteInfo: NetlifySiteInfo | undefined;

    // If no siteId provided, create a new site
    if (!targetSiteId) {
      const siteName = `ecode-${chatId}-${Date.now()}`;

      const createSiteResponse = await timeoutFetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: siteName,
          custom_domain: null,
        }),
      });

      if (!createSiteResponse.ok) {
        console.error('Netlify site creation failed:', { status: createSiteResponse.status });
        return webApiErrorResponse(request, 'NETLIFY_SITE_CREATE_FAILED', createSiteResponse.status);
      }

      const newSite = (await createSiteResponse.json()) as any;
      targetSiteId = newSite.id;
      siteInfo = {
        id: newSite.id,
        name: newSite.name,
        url: newSite.url,
        chatId,
      };
    } else {
      // Get existing site info
      if (targetSiteId) {
        const siteResponse = await timeoutFetch(
          `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (siteResponse.ok) {
          const existingSite = (await siteResponse.json()) as any;
          siteInfo = {
            id: existingSite.id,
            name: existingSite.name,
            url: existingSite.url,
            chatId,
          };
        } else {
          targetSiteId = undefined;
        }
      }

      // If no siteId provided or site doesn't exist, create a new site
      if (!targetSiteId) {
        const siteName = `ecode-${chatId}-${Date.now()}`;

        const createSiteResponse = await timeoutFetch('https://api.netlify.com/api/v1/sites', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: siteName,
            custom_domain: null,
          }),
        });

        if (!createSiteResponse.ok) {
          console.error('Netlify site creation failed:', { status: createSiteResponse.status });
          return webApiErrorResponse(request, 'NETLIFY_SITE_CREATE_FAILED', createSiteResponse.status);
        }

        const newSite = (await createSiteResponse.json()) as any;
        targetSiteId = newSite.id;
        siteInfo = {
          id: newSite.id,
          name: newSite.name,
          url: newSite.url,
          chatId,
        };
      }
    }

    if (!targetSiteId) {
      return webApiErrorResponse(request, 'NETLIFY_SITE_CREATE_FAILED', 500);
    }

    // Create file digests
    const fileDigests: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(files)) {
      // Ensure file path starts with a forward slash
      const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
      const hash = await sha1(content);
      fileDigests[normalizedPath] = hash;
    }

    // Create a new deploy with digests
    const deployResponse = await timeoutFetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}/deploys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: fileDigests,
          async: true,
          skip_processing: false,
          draft: false, // Change this to false for production deployments
          function_schedules: [],
          framework: null,
        }),
      },
    );

    if (!deployResponse.ok) {
      console.error('Netlify deployment creation failed:', { status: deployResponse.status });
      return webApiErrorResponse(request, 'NETLIFY_DEPLOYMENT_CREATE_FAILED', deployResponse.status);
    }

    const deploy = (await deployResponse.json()) as any;

    let retryCount = 0;

    const maxRetries = 60;

    let filesUploaded = false;

    // Poll until deploy is ready for file uploads
    while (retryCount < maxRetries) {
      let status: any;

      /*
       * A single transient status-poll failure (the 30s timeout abort, a DNS
       * hiccup, or a momentary network blip during the polling window) must NOT
       * fail the whole deploy — Netlify may still be preparing or have already
       * succeeded. Treat it like the upload block: count the retry, back off,
       * and poll again instead of letting it bubble to the outer catch.
       */
      try {
        const statusResponse = await timeoutFetch(
          `https://api.netlify.com/api/v1/sites/${encodeURIComponent(targetSiteId)}/deploys/${encodeURIComponent(deploy.id)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(30000),
          },
        );

        if (!statusResponse.ok) {
          /*
           * Transient upstream failures (5xx / 429 rate-limit / 408 timeout) must
           * be retried like the catch block below and the upload block above —
           * Netlify may still be preparing the deploy. Only genuinely terminal
           * statuses (auth, not-found, other 4xx) fail fast, since they will not
           * self-heal by polling again.
           */
          if (statusResponse.status >= 500 || statusResponse.status === 429 || statusResponse.status === 408) {
            console.error(`Deploy status poll returned ${statusResponse.status}, retrying`);
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          console.error('Netlify deployment status request failed:', { status: statusResponse.status });

          return webApiErrorResponse(request, 'NETLIFY_DEPLOYMENT_STATUS_FAILED', statusResponse.status);
        }

        status = (await statusResponse.json()) as any;
      } catch (error) {
        console.error('Deploy status poll error:', error);
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (!filesUploaded && (status.state === 'prepared' || status.state === 'uploaded')) {
        // Upload all files regardless of required array
        for (const [filePath, content] of Object.entries(files)) {
          const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;

          const encodedPath = normalizedPath
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');

          let uploadSuccess = false;
          let uploadRetries = 0;

          while (!uploadSuccess && uploadRetries < 3) {
            try {
              const uploadResponse = await timeoutFetch(
                `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deploy.id)}/files${encodedPath}`,
                {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/octet-stream',
                  },
                  body: content,

                  /*
                   * Bound the upload so a hung Netlify endpoint can't pin the
                   * request forever; the surrounding retry/backoff handles aborts.
                   */
                  signal: AbortSignal.timeout(30000),
                },
              );

              uploadSuccess = uploadResponse.ok;

              if (!uploadSuccess) {
                console.error('Upload failed:', await uploadResponse.text());
                uploadRetries++;
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } catch (error) {
              console.error('Upload error:', error);
              uploadRetries++;
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }

          if (!uploadSuccess) {
            return webApiErrorResponse(request, 'NETLIFY_FILE_UPLOAD_FAILED', 500, {
              values: { path: filePath },
            });
          }
        }

        filesUploaded = true;
      }

      if (status.state === 'ready') {
        // Only return after files are uploaded
        return json(
          {
            success: true,
            deploy: {
              id: status.id,
              state: status.state,
              url: status.ssl_url || status.url,
            },
            site: siteInfo,
          },
          { headers: webApiLocaleHeaders(request) },
        );
      }

      if (status.state === 'error') {
        console.error('Netlify deployment preparation failed:', { deployId: deploy.id });
        return webApiErrorResponse(request, 'NETLIFY_DEPLOY_PREPARATION_FAILED', 500);
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (retryCount >= maxRetries) {
      return webApiErrorResponse(request, 'NETLIFY_DEPLOY_PREPARATION_TIMED_OUT', 504);
    }

    // Make sure we're returning the deploy ID and site info
    return json(
      {
        success: true,
        deploy: {
          id: deploy.id,
          state: deploy.state,
        },
        site: siteInfo,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Deploy error:', error);
    return webApiErrorResponse(request, 'DEPLOYMENT_FAILED', 500);
  }
}
