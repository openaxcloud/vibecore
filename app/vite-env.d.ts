declare const __COMMIT_HASH: string;
declare const __APP_VERSION: string;

interface ImportMetaEnv {
  readonly RUNTIME_MODE?: 'webcontainer' | 'remote-kubernetes';
  readonly VITE_RUNTIME_MODE?: 'webcontainer' | 'remote-kubernetes';
  readonly RUNTIME_API_BASE_URL?: string;
  readonly VITE_RUNTIME_API_BASE_URL?: string;
  readonly VITE_SAAS_COMMERCIAL?: string;
}
