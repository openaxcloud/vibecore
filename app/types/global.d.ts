declare module 'react-dom/server.browser' {
  export { renderToReadableStream } from 'react-dom/server';
}

interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  webkitSpeechRecognition: typeof SpeechRecognition;
  SpeechRecognition: typeof SpeechRecognition;
  vibecoreDesktop?: {
    auth: {
      get(): Promise<{ token?: string; user?: unknown; encryptionAvailable: boolean }>;
      set(token: string, user?: { id?: string; email?: string; organizationId?: string }): Promise<{ ok: boolean }>;
      clear(): Promise<{ ok: boolean }>;
    };
    files: {
      importZip(): Promise<string | undefined>;
      exportZip(defaultPath?: string): Promise<string | undefined>;
      openLocalFolder(): Promise<string | undefined>;
    };
    notifications: {
      show(input: { title?: string; body?: string }): Promise<{ shown: boolean; supported: boolean }>;
    };
    settings: {
      get(): Promise<unknown>;
      set(settings: unknown): Promise<{ ok: boolean }>;
    };
    network: {
      status(): Promise<{ online: boolean; lastCheckedAt: string }>;
    };
    crashReporting: {
      status(): Promise<{ enabled: boolean; reportsDirectory: string }>;
    };
    onDeepLink(callback: (url: string) => void): () => void;
    onMenuAction(callback: (action: string) => void): () => void;
  };
}

interface Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}
