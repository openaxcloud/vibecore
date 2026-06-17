import {
  WebContainerRuntimeAdapter,
  createBrowserWebContainerRuntime,
  type BrowserWebContainerRuntime,
  type WebContainerLike,
} from '@vibecore/runtime-webcontainer';
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
      throw new Error(`Failed to load inspector script (${response.status})`);
    }

    return response.text();
  });

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
        const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';

        /*
         * Lazy import to avoid a static webcontainer→workbench→RuntimeAdapter import
         * cycle (which TDZ-crashed `new WorkbenchStore()` at module load and aborted
         * client hydration). This callback runs at runtime, long after modules settle.
         */
        void import('~/lib/stores/workbench').then(({ workbenchStore }) => {
          workbenchStore.actionAlert.set({
            type: 'preview',
            title,
            description: 'message' in message ? message.message : 'Unknown error',
            content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
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
