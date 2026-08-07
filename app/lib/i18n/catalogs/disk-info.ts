type DiskInfoCopy = Readonly<{
  unavailable: string;
  unknownFilesystem: string;
  genericError: string;
  unsupportedPlatform: string;
}>;

const DISK_INFO_COPY: Readonly<Record<'en' | 'fr', DiskInfoCopy>> = {
  en: {
    unavailable: 'Disk information is not available in this environment.',
    unknownFilesystem: 'Unknown',
    genericError: 'Disk information could not be loaded.',
    unsupportedPlatform: 'Disk information is not supported on {platform}.',
  },
  fr: {
    unavailable: 'Les informations sur le disque ne sont pas disponibles dans cet environnement.',
    unknownFilesystem: 'Inconnu',
    genericError: 'Impossible de charger les informations sur le disque.',
    unsupportedPlatform: 'Les informations sur le disque ne sont pas prises en charge sur {platform}.',
  },
};

export function getDiskInfoCopy(language?: string | null): DiskInfoCopy {
  return language?.toLowerCase().startsWith('fr') ? DISK_INFO_COPY.fr : DISK_INFO_COPY.en;
}

export function formatDiskInfoCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
