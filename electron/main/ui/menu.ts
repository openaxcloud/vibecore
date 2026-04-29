import { BrowserWindow, Menu, shell } from 'electron';

export function setupMenu(win: BrowserWindow): void {
  const currentMenu = Menu.getApplicationMenu();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(currentMenu ? currentMenu.items : []),
      {
        label: 'VibeCore',
        submenu: [
          {
            label: 'Desktop Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => win.loadURL('http://localhost:5173/desktop-settings'),
          },
          { type: 'separator' },
          {
            label: 'Open Dashboard',
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => win.loadURL('http://localhost:5173/dashboard'),
          },
          {
            label: 'Open Projects',
            accelerator: 'CmdOrCtrl+Shift+P',
            click: () => win.loadURL('http://localhost:5173/projects'),
          },
          { type: 'separator' },
          {
            label: 'Documentation',
            click: () => shell.openExternal('https://docs.vibecore.local').catch(() => undefined),
          },
          { type: 'separator' },
          { role: 'quit', label: 'Quit VibeCore' },
        ],
      },
      {
        label: 'Project',
        submenu: [
          {
            label: 'Import Zip',
            accelerator: 'CmdOrCtrl+O',
            click: () => win.webContents.send('desktop:menu-action', 'import-zip'),
          },
          {
            label: 'Open Local Folder as Project',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => win.webContents.send('desktop:menu-action', 'open-local-folder'),
          },
          {
            label: 'Export Project',
            accelerator: 'CmdOrCtrl+E',
            click: () => win.webContents.send('desktop:menu-action', 'export-project'),
          },
        ],
      },
      {
        label: 'Go',
        submenu: [
          {
            label: 'Back',
            accelerator: 'CmdOrCtrl+[',
            click: () => {
              win?.webContents.navigationHistory.goBack();
            },
          },
          {
            label: 'Forward',
            accelerator: 'CmdOrCtrl+]',
            click: () => {
              win?.webContents.navigationHistory.goForward();
            },
          },
        ],
      },
    ]),
  );
}
