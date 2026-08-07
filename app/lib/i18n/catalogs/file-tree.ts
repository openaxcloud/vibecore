import { resolveMarketingLanguage } from './marketing';

export interface FileTreeCopy {
  views: {
    toolbar: string;
    files: string;
    openEditors: string;
    outline: string;
    timeline: string;
    bookmarks: string;
  };
  empty: {
    openEditorsTitle: string;
    openEditorsDescription: string;
    outlineTitle: string;
    outlineDescription: string;
    timelineTitle: string;
    timelineDescription: string;
    bookmarksTitle: string;
    bookmarksDescription: string;
    workspaceUnavailableTitle: string;
    workspaceUnavailableDescription: string;
    loadingTitle: string;
    loadingDescription: string;
    noFilesTitle: string;
    noFilesDescription: string;
  };
  timeline: {
    editedAt: string;
    editedThisSession: string;
    gitStatus: string;
  };
  entity: {
    fileLower: string;
    fileTitle: string;
    folderLower: string;
    folderTitle: string;
  };
  toast: {
    bookmarkRemoved: string;
    bookmarkAdded: string;
    uploaded: string;
    uploadFailed: string;
    uploadError: string;
    alreadyExists: string;
    created: string;
    createFailed: string;
    lockedCannotDelete: string;
    deleted: string;
    deleteFailed: string;
    deleteError: string;
    lockedCannotRename: string;
    renameIntoSelf: string;
    renamed: string;
    renameFailed: string;
    duplicated: string;
    duplicateFailed: string;
    revealed: string;
    locked: string;
    lockFailed: string;
    lockError: string;
    unlocked: string;
    unlockFailed: string;
    unlockError: string;
  };
  overwrite: {
    title: string;
    confirm: string;
    single: string;
    multiple: string;
  };
  menu: {
    newFile: string;
    newFolder: string;
    rename: string;
    duplicate: string;
    copyPath: string;
    copyRelativePath: string;
    reveal: string;
    removeBookmark: string;
    addBookmark: string;
    lockFile: string;
    unlockFile: string;
    lockFolder: string;
    unlockFolder: string;
    delete: string;
  };
  dialog: {
    deleteTitle: string;
    deleteDescription: string;
    deleteConfirm: string;
  };
  placeholder: {
    fileName: string;
    folderName: string;
    newName: string;
  };
  detail: {
    dropFiles: string;
    unsavedChanges: string;
    pinnedEditor: string;
    bookmarkedFile: string;
    folderLocked: string;
    fileLocked: string;
    bookmarked: string;
    line: string;
    reconnect: string;
  };
  fileTypes: {
    typescript: string;
    typescriptReact: string;
    javascript: string;
    javascriptReact: string;
    json: string;
    css: string;
    scss: string;
    sass: string;
    html: string;
    markdown: string;
    mdx: string;
    python: string;
    go: string;
    rust: string;
    java: string;
    image: string;
    svg: string;
    lockfile: string;
    yaml: string;
    npmPackageManifest: string;
    npmLockfile: string;
    pnpmLockfile: string;
    yarnLockfile: string;
    viteConfig: string;
    typescriptConfig: string;
    environmentFile: string;
    environmentExample: string;
    dockerfile: string;
    file: string;
  };
}

export const fileTreeEn: FileTreeCopy = {
  views: {
    toolbar: 'File explorer views',
    files: 'Files',
    openEditors: 'Open editors',
    outline: 'Outline',
    timeline: 'Timeline',
    bookmarks: 'Bookmarks',
  },
  empty: {
    openEditorsTitle: 'No open editors',
    openEditorsDescription: 'Open a file to pin it in this view.',
    outlineTitle: 'No outline available',
    outlineDescription: 'Open a source file to inspect symbols and headings.',
    timelineTitle: 'No timeline yet',
    timelineDescription: 'Edits and Git changes will appear here.',
    bookmarksTitle: 'No bookmarks',
    bookmarksDescription: 'Use the file context menu to bookmark important files.',
    workspaceUnavailableTitle: 'Workspace unavailable',
    workspaceUnavailableDescription:
      'The workspace runtime stopped or failed to start. Reconnect to load your project files.',
    loadingTitle: 'Loading workspace files…',
    loadingDescription: 'Provisioning your workspace. Files will appear here once it is ready.',
    noFilesTitle: 'No files available',
    noFilesDescription: 'Project files will appear here once the workspace is loaded.',
  },
  timeline: {
    editedAt: 'Edited {{date}}',
    editedThisSession: 'Edited in this session',
    gitStatus: 'Git status: {{status}}',
  },
  entity: {
    fileLower: 'file',
    fileTitle: 'File',
    folderLower: 'folder',
    folderTitle: 'Folder',
  },
  toast: {
    bookmarkRemoved: 'Bookmark removed',
    bookmarkAdded: 'Bookmark added',
    uploaded: 'Uploaded {{name}}',
    uploadFailed: 'Failed to upload {{name}}',
    uploadError: 'Error uploading {{name}}',
    alreadyExists: 'A file or folder named “{{name}}” already exists',
    created: '{{entityTitle}} created successfully',
    createFailed: 'Failed to create {{entityLower}}',
    lockedCannotDelete: 'This {{entityLower}} is locked and cannot be deleted. Unlock it first.',
    deleted: '{{entityTitle}} deleted successfully',
    deleteFailed: 'Failed to delete {{entityLower}}',
    deleteError: 'Error deleting {{entityLower}}',
    lockedCannotRename: 'This {{entityLower}} is locked and cannot be renamed. Unlock it first.',
    renameIntoSelf: 'Cannot rename a folder into a path inside itself',
    renamed: '{{entityTitle}} renamed',
    renameFailed: 'Failed to rename {{entityLower}}',
    duplicated: '{{entityTitle}} duplicated',
    duplicateFailed: 'Failed to duplicate {{entityLower}}',
    revealed: '{{name}} revealed in project files',
    locked: '{{entityTitle}} locked successfully',
    lockFailed: 'Failed to lock {{entityLower}}',
    lockError: 'Error locking {{entityLower}}',
    unlocked: '{{entityTitle}} unlocked successfully',
    unlockFailed: 'Failed to unlock {{entityLower}}',
    unlockError: 'Error unlocking {{entityLower}}',
  },
  overwrite: {
    title: 'Overwrite existing files?',
    confirm: 'Overwrite',
    single: 'A file named "{{name}}" already exists here. Overwrite it?',
    multiple: '{{count}} files already exist here and will be overwritten:\n\n{{names}}\n\nOverwrite them?',
  },
  menu: {
    newFile: 'New File',
    newFolder: 'New Folder',
    rename: 'Rename',
    duplicate: 'Duplicate',
    copyPath: 'Copy path',
    copyRelativePath: 'Copy relative path',
    reveal: 'Reveal in file explorer',
    removeBookmark: 'Remove bookmark',
    addBookmark: 'Add bookmark',
    lockFile: 'Lock File',
    unlockFile: 'Unlock File',
    lockFolder: 'Lock Folder',
    unlockFolder: 'Unlock Folder',
    delete: 'Delete {{entityLower}}',
  },
  dialog: {
    deleteTitle: 'Delete {{entityLower}}',
    deleteDescription: 'Are you sure you want to delete {{entityLower}} “{{name}}”? This cannot be undone.',
    deleteConfirm: 'Delete',
  },
  placeholder: {
    fileName: 'Enter file name…',
    folderName: 'Enter folder name…',
    newName: 'Enter new name…',
  },
  detail: {
    dropFiles: 'Drop files to upload',
    unsavedChanges: 'Unsaved changes',
    pinnedEditor: 'Pinned editor',
    bookmarkedFile: 'Bookmarked file',
    folderLocked: 'Folder is locked',
    fileLocked: 'File is locked',
    bookmarked: 'Bookmarked',
    line: 'Line',
    reconnect: 'Reconnect',
  },
  fileTypes: {
    typescript: 'TypeScript',
    typescriptReact: 'TypeScript React',
    javascript: 'JavaScript',
    javascriptReact: 'JavaScript React',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    html: 'HTML',
    markdown: 'Markdown',
    mdx: 'MDX',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    image: 'Image',
    svg: 'SVG',
    lockfile: 'Lockfile',
    yaml: 'YAML',
    npmPackageManifest: 'npm package manifest',
    npmLockfile: 'npm lockfile',
    pnpmLockfile: 'pnpm lockfile',
    yarnLockfile: 'Yarn lockfile',
    viteConfig: 'Vite config',
    typescriptConfig: 'TypeScript config',
    environmentFile: 'Environment file',
    environmentExample: 'Environment example',
    dockerfile: 'Dockerfile',
    file: 'File',
  },
};

export const fileTreeFr: FileTreeCopy = {
  views: {
    toolbar: 'Vues de l’explorateur de fichiers',
    files: 'Fichiers',
    openEditors: 'Éditeurs ouverts',
    outline: 'Plan du fichier',
    timeline: 'Chronologie',
    bookmarks: 'Favoris',
  },
  empty: {
    openEditorsTitle: 'Aucun éditeur ouvert',
    openEditorsDescription: 'Ouvrez un fichier pour l’épingler dans cette vue.',
    outlineTitle: 'Aucun plan disponible',
    outlineDescription: 'Ouvrez un fichier source pour examiner ses symboles et ses titres.',
    timelineTitle: 'Aucune activité pour le moment',
    timelineDescription: 'Les modifications et changements Git apparaîtront ici.',
    bookmarksTitle: 'Aucun favori',
    bookmarksDescription: 'Utilisez le menu contextuel d’un fichier pour l’ajouter aux favoris.',
    workspaceUnavailableTitle: 'Espace de travail indisponible',
    workspaceUnavailableDescription:
      'L’environnement d’exécution de l’espace de travail s’est arrêté ou n’a pas démarré. Reconnectez-vous pour charger les fichiers du projet.',
    loadingTitle: 'Chargement des fichiers de l’espace de travail…',
    loadingDescription:
      'L’espace de travail est en cours de préparation. Les fichiers apparaîtront dès qu’il sera prêt.',
    noFilesTitle: 'Aucun fichier disponible',
    noFilesDescription: 'Les fichiers du projet apparaîtront ici après le chargement de l’espace de travail.',
  },
  timeline: {
    editedAt: 'Modifié le {{date}}',
    editedThisSession: 'Modifié pendant cette session',
    gitStatus: 'État Git : {{status}}',
  },
  entity: {
    fileLower: 'fichier',
    fileTitle: 'Fichier',
    folderLower: 'dossier',
    folderTitle: 'Dossier',
  },
  toast: {
    bookmarkRemoved: 'Fichier retiré des favoris',
    bookmarkAdded: 'Fichier ajouté aux favoris',
    uploaded: '{{name}} a été téléversé',
    uploadFailed: 'Échec du téléversement de {{name}}',
    uploadError: 'Erreur lors du téléversement de {{name}}',
    alreadyExists: 'Un fichier ou dossier nommé « {{name}} » existe déjà',
    created: '{{entityTitle}} créé avec succès',
    createFailed: 'Impossible de créer le {{entityLower}}',
    lockedCannotDelete: 'Ce {{entityLower}} est verrouillé et ne peut pas être supprimé. Déverrouillez-le d’abord.',
    deleted: '{{entityTitle}} supprimé avec succès',
    deleteFailed: 'Impossible de supprimer le {{entityLower}}',
    deleteError: 'Erreur lors de la suppression du {{entityLower}}',
    lockedCannotRename: 'Ce {{entityLower}} est verrouillé et ne peut pas être renommé. Déverrouillez-le d’abord.',
    renameIntoSelf: 'Impossible de déplacer un dossier dans l’un de ses propres sous-dossiers',
    renamed: '{{entityTitle}} renommé',
    renameFailed: 'Impossible de renommer le {{entityLower}}',
    duplicated: '{{entityTitle}} dupliqué',
    duplicateFailed: 'Impossible de dupliquer le {{entityLower}}',
    revealed: '{{name}} affiché dans les fichiers du projet',
    locked: '{{entityTitle}} verrouillé avec succès',
    lockFailed: 'Impossible de verrouiller le {{entityLower}}',
    lockError: 'Erreur lors du verrouillage du {{entityLower}}',
    unlocked: '{{entityTitle}} déverrouillé avec succès',
    unlockFailed: 'Impossible de déverrouiller le {{entityLower}}',
    unlockError: 'Erreur lors du déverrouillage du {{entityLower}}',
  },
  overwrite: {
    title: 'Remplacer les fichiers existants ?',
    confirm: 'Remplacer',
    single: 'Un fichier nommé « {{name}} » existe déjà ici. Voulez-vous le remplacer ?',
    multiple: '{{count}} fichiers existent déjà ici et seront remplacés :\n\n{{names}}\n\nVoulez-vous les remplacer ?',
  },
  menu: {
    newFile: 'Nouveau fichier',
    newFolder: 'Nouveau dossier',
    rename: 'Renommer',
    duplicate: 'Dupliquer',
    copyPath: 'Copier le chemin',
    copyRelativePath: 'Copier le chemin relatif',
    reveal: 'Afficher dans l’explorateur',
    removeBookmark: 'Retirer des favoris',
    addBookmark: 'Ajouter aux favoris',
    lockFile: 'Verrouiller le fichier',
    unlockFile: 'Déverrouiller le fichier',
    lockFolder: 'Verrouiller le dossier',
    unlockFolder: 'Déverrouiller le dossier',
    delete: 'Supprimer le {{entityLower}}',
  },
  dialog: {
    deleteTitle: 'Supprimer le {{entityLower}}',
    deleteDescription:
      'Voulez-vous vraiment supprimer le {{entityLower}} « {{name}} » ? Cette action est irréversible.',
    deleteConfirm: 'Supprimer',
  },
  placeholder: {
    fileName: 'Saisissez le nom du fichier…',
    folderName: 'Saisissez le nom du dossier…',
    newName: 'Saisissez le nouveau nom…',
  },
  detail: {
    dropFiles: 'Déposez les fichiers pour les téléverser',
    unsavedChanges: 'Modifications non enregistrées',
    pinnedEditor: 'Éditeur épinglé',
    bookmarkedFile: 'Fichier favori',
    folderLocked: 'Le dossier est verrouillé',
    fileLocked: 'Le fichier est verrouillé',
    bookmarked: 'Favori',
    line: 'Ligne',
    reconnect: 'Reconnecter',
  },
  fileTypes: {
    typescript: 'TypeScript',
    typescriptReact: 'TypeScript React',
    javascript: 'JavaScript',
    javascriptReact: 'JavaScript React',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    html: 'HTML',
    markdown: 'Markdown',
    mdx: 'MDX',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    image: 'Image',
    svg: 'SVG',
    lockfile: 'Fichier de verrouillage',
    yaml: 'YAML',
    npmPackageManifest: 'Manifeste de paquet npm',
    npmLockfile: 'Fichier de verrouillage npm',
    pnpmLockfile: 'Fichier de verrouillage pnpm',
    yarnLockfile: 'Fichier de verrouillage Yarn',
    viteConfig: 'Configuration Vite',
    typescriptConfig: 'Configuration TypeScript',
    environmentFile: 'Fichier d’environnement',
    environmentExample: 'Exemple de fichier d’environnement',
    dockerfile: 'Dockerfile',
    file: 'Fichier',
  },
};

export function getFileTreeCopy(language?: string | null): FileTreeCopy {
  return resolveMarketingLanguage(language) === 'fr' ? fileTreeFr : fileTreeEn;
}

export function formatFileTreeCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
