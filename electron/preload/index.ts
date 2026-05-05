import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

console.debug('start preload.', ipcRenderer);

const ipc = {
  invoke(...args: any[]) {
    return ipcRenderer.invoke('ipcTest', ...args);
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  on(channel: string, func: Function) {
    const f = (event: IpcRendererEvent, ...args: any[]) => func(...[event, ...args]);
    console.debug('register listener', channel, f);
    ipcRenderer.on(channel, f);

    return () => {
      console.debug('remove listener', channel, f);
      ipcRenderer.removeListener(channel, f);
    };
  },
};

contextBridge.exposeInMainWorld('ipc', ipc);

contextBridge.exposeInMainWorld('vibecoreDesktop', {
  auth: {
    get: () => ipcRenderer.invoke('desktop:auth:get'),
    set: (token: string, user?: { id?: string; email?: string; organizationId?: string }) =>
      ipcRenderer.invoke('desktop:auth:set', { token, user }),
    clear: () => ipcRenderer.invoke('desktop:auth:clear'),
  },
  files: {
    importZip: () => ipcRenderer.invoke('desktop:file:import'),
    exportZip: (defaultPath?: string) => ipcRenderer.invoke('desktop:file:export', defaultPath),
    openLocalFolder: () => ipcRenderer.invoke('desktop:folder:open'),
  },
  notifications: {
    show: (input: { title?: string; body?: string }) => ipcRenderer.invoke('desktop:notification:show', input),
  },
  settings: {
    get: () => ipcRenderer.invoke('desktop:settings:get'),
    set: (settings: unknown) => ipcRenderer.invoke('desktop:settings:set', settings),
  },
  network: {
    status: () => ipcRenderer.invoke('desktop:network:status'),
  },
  crashReporting: {
    status: () => ipcRenderer.invoke('desktop:crash-reporting:status'),
  },
  onDeepLink: (callback: (url: string) => void) => {
    const listener = (_event: IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('desktop:deep-link', listener);

    return () => ipcRenderer.removeListener('desktop:deep-link', listener);
  },
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('desktop:menu-action', listener);

    return () => ipcRenderer.removeListener('desktop:menu-action', listener);
  },
});
