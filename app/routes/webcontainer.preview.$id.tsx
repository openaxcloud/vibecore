import { useCallback, useEffect, useRef, useState } from 'react';
import { data as json, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { getApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

const PREVIEW_CHANNEL = 'preview-updates';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);
  const headers = localeResponseHeaders(request, localeResolution);
  const previewId = params.id;

  if (!previewId) {
    throw new Response(copy['apiRuntime.preview.idRequired'], { status: 400, headers });
  }

  /*
   * previewId is interpolated into the iframe host
   * (`https://${previewId}.local-credentialless.webcontainer-api.io`). A
   * WebContainer preview subdomain is a fixed lowercase alphanumeric/hyphen
   * token; reject anything else so a crafted id can't break out of the host
   * template (e.g. `evil.com#`, extra dots/slashes) and point the iframe at an
   * attacker-controlled origin.
   */
  if (!/^[a-z0-9-]+$/.test(previewId)) {
    throw new Response(copy['apiRuntime.preview.idInvalid'], { status: 400, headers });
  }

  return json({ previewId, frameTitle: copy['apiRuntime.preview.frameTitle'] }, { headers });
}

export default function WebContainerPreview() {
  const { previewId, frameTitle } = useLoaderData<typeof loader>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const broadcastChannelRef = useRef<BroadcastChannel>();
  const [previewUrl, setPreviewUrl] = useState('');

  // Handle preview refresh
  const handleRefresh = useCallback(() => {
    if (iframeRef.current && previewUrl) {
      // Force a clean reload
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) {
          iframeRef.current.src = previewUrl;
        }
      });
    }
  }, [previewUrl]);

  // Notify other tabs that this preview is ready
  const notifyPreviewReady = useCallback(() => {
    if (broadcastChannelRef.current && previewUrl) {
      broadcastChannelRef.current.postMessage({
        type: 'preview-ready',
        previewId,
        url: previewUrl,
        timestamp: Date.now(),
      });
    }
  }, [previewId, previewUrl]);

  useEffect(() => {
    const supportsBroadcastChannel = typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function';

    if (supportsBroadcastChannel) {
      broadcastChannelRef.current = new window.BroadcastChannel(PREVIEW_CHANNEL);

      // Listen for preview updates
      broadcastChannelRef.current.onmessage = (event) => {
        if (!event.data || typeof event.data !== 'object') {
          return;
        }

        if (event.data.previewId === previewId) {
          if (event.data.type === 'refresh-preview' || event.data.type === 'file-change') {
            handleRefresh();
          }
        }
      };
    } else {
      broadcastChannelRef.current = undefined;
    }

    // Construct the WebContainer preview URL
    const url = `https://${previewId}.local-credentialless.webcontainer-api.io`;
    setPreviewUrl(url);

    // Set the iframe src
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }

    // Notify other tabs that this preview is ready
    notifyPreviewReady();

    // Cleanup
    return () => {
      broadcastChannelRef.current?.close();
    };
  }, [previewId, handleRefresh, notifyPreviewReady]);

  return (
    <div className="w-full h-full">
      <iframe
        ref={iframeRef}
        title={frameTitle}
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
        allow="cross-origin-isolated"
        loading="eager"
        onLoad={notifyPreviewReady}
      />
    </div>
  );
}
