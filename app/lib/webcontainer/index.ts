import {
  WebContainerRuntimeAdapter,
  createBrowserWebContainerRuntime,
  type BrowserWebContainerRuntime,
  type WebContainerLike,
} from '@vibecore/runtime-webcontainer';
import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';
import { WORK_DIR, WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data?.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot?.data) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainerLike> = new Promise(() => {
  // noop for ssr
});

let browserRuntime: BrowserWebContainerRuntime | undefined;
let browserWebcontainer: Promise<WebContainerLike> | undefined;

// Keep WebContainer boot lazy so importing the IDE route does not block React hydration.
export const webcontainerRuntimeAdapter = new WebContainerRuntimeAdapter({
  workdir: WORK_DIR,
  bootWebContainer: bootBrowserWebContainer,
});

function bootBrowserWebContainer() {
  if (import.meta.env.SSR) {
    return webcontainer;
  }

  if (browserWebcontainer) {
    return browserWebcontainer;
  }

  const inspectorScript = fetch('/inspector-script.js').then((response) => {
    if (!response.ok) {
      throw new Error(
        clientStoresServicesText('clientRuntime.webcontainer.inspectorLoadFailed', { status: response.status }),
      );
    }

    return response.text();
  });

  /*
   * Un gestionnaire posé TOUT DE SUITE, sans rien avaler.
   *
   * `inspectorScript` est passée plus bas et n'est consommée qu'au moment où
   * le runtime en a besoin. Entre les deux, si le fetch échoue, la promesse est
   * rejetée sans que personne n'écoute : Node la signale en « unhandled
   * rejection », et vitest fait alors échouer TOUT le run.
   *
   * Mesuré le 2026-09-04 sur #409 et #417 : « Test Files 991 passed », « Tests
   * 7466 passed », « Errors 1 error », puis exit 1. Sept mille tests verts et un
   * CI rouge, sur cette seule ligne :
   *
   *   TypeError: Failed to parse URL from /inspector-script.js
   *
   * Une URL relative n'a pas de base hors navigateur : sous Node elle rejette
   * immédiatement. Le rejet reste propagé au vrai consommateur : `.catch` ici ne
   * remplace pas la promesse, il déclare seulement qu'elle est surveillée.
   */
  inspectorScript.catch(() => undefined);

  browserRuntime = createBrowserWebContainerRuntime({
    workdir: WORK_DIR,
    workdirName: WORK_DIR_NAME,
    hotData: import.meta.hot?.data,
    context: webcontainerContext,
    inspectorScript,
    forwardPreviewErrors: true,
    onPreviewMessage: (message) => {
      console.log('WebContainer preview message:', message);

      // Handle both uncaught exceptions and unhandled promise rejections
      if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
        const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';

        const title = clientStoresServicesText(
          isPromise ? 'clientRuntime.webcontainer.unhandledRejection' : 'clientRuntime.webcontainer.uncaughtException',
        );

        const location = `${message.pathname}${message.search}${message.hash}`;

        /*
         * Lazy import to avoid a static webcontainer→workbench→RuntimeAdapter import
         * cycle (which TDZ-crashed `new WorkbenchStore()` at module load and aborted
         * client hydration). This callback runs at runtime, long after modules settle.
         */
        void import('~/lib/stores/workbench').then(({ workbenchStore }) => {
          workbenchStore.actionAlert.set({
            type: 'preview',
            title,

            /*
             * Le type EST connu — on vient de le resoudre juste au-dessus, et
             * l'emplacement aussi. Afficher « une erreur inconnue » alors qu'on
             * a le type, l'emplacement, le port et la pile est trompeur : ca
             * fait lire un defaut de l'application generee comme une panne de
             * la plateforme. Constate le 2026-09-03 sur une capture d'Avi.
             *
             * Meme classe de defaut que « Unknown release type "ops" » sans la
             * liste des types : nommer le probleme sans donner le moyen d'agir.
             */
            description: clientStoresServicesText('clientRuntime.webcontainer.previewErrorAt', {
              title,
              location,
            }),
            content: clientStoresServicesText('clientRuntime.webcontainer.previewErrorDetails', {
              location,
              port: message.port,
              stack: cleanStackTrace(message.stack || ''),
            }),
            source: 'preview',
          });
        });
      }
    },
  });

  browserWebcontainer = browserRuntime.webcontainer;
  webcontainer = browserWebcontainer;

  return browserWebcontainer;
}
