/**
 * Server-only disk-information utilities.
 *
 * This module is imported exclusively from the `api.system.disk-info` route
 * loader/action (server execution paths). It dynamically imports
 * `node:child_process` so that the route module can still be analyzed in
 * Cloudflare/WebContainer-style environments where `child_process` is absent
 * — the import simply fails there and we fall back to a placeholder row.
 */

export interface DiskInfo {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percentage: number;
  mountpoint: string;
  timestamp: string;
  error?: string;
}

type ExecSync = (command: string, options: { encoding: BufferEncoding }) => string | Buffer;

const unavailableRow = (): DiskInfo => ({
  filesystem: 'N/A',
  size: 0,
  used: 0,
  available: 0,
  percentage: 0,
  mountpoint: 'N/A',
  timestamp: new Date().toISOString(),
  error: 'Disk information is not available in this environment',
});

const errorRow = (mountpoint: string, error: unknown): DiskInfo => ({
  filesystem: 'Unknown',
  size: 0,
  used: 0,
  available: 0,
  percentage: 0,
  mountpoint,
  timestamp: new Date().toISOString(),
  error: error instanceof Error ? error.message : 'Unknown error',
});

/**
 * Parse the output of `df -k` (used on macOS and Linux) into DiskInfo rows.
 * Pure function — exported for testing.
 */
export function parseDfOutput(output: string): DiskInfo[] {
  // Skip the header line
  const lines = output.trim().split('\n').slice(1);

  return lines
    .map((line: string): DiskInfo => {
      const parts = line.trim().split(/\s+/);
      const filesystem = parts[0];
      const size = parseInt(parts[1], 10) * 1024; // Convert KB to bytes
      const used = parseInt(parts[2], 10) * 1024;
      const available = parseInt(parts[3], 10) * 1024;
      const percentageStr = (parts[4] ?? '').replace('%', '');
      const percentage = parseInt(percentageStr, 10);

      /*
       * The mountpoint is always the LAST whitespace-separated token. On Linux
       * `df -k` emits 6 columns (mountpoint = parts[5]), but on macOS it emits
       * extra inode columns (iused, ifree, %iused) between Capacity and
       * 'Mounted on', giving 9 columns. Reading a fixed index would pick up the
       * iused count instead of the path; take the last token so both layouts
       * parse correctly.
       */
      const mountpoint = parts[parts.length - 1];

      return {
        filesystem,
        size: Number.isFinite(size) ? size : 0,
        used: Number.isFinite(used) ? used : 0,
        available: Number.isFinite(available) ? available : 0,
        percentage: Number.isFinite(percentage) ? percentage : 0,
        mountpoint,
        timestamp: new Date().toISOString(),
      };
    })
    .filter((disk) => disk.filesystem && disk.mountpoint);
}

/**
 * Parse PowerShell `Get-PSDrive` JSON output into DiskInfo rows (Windows).
 * Pure function — exported for testing.
 */
export function parsePowerShellOutput(output: string): DiskInfo[] {
  const driveData = JSON.parse(output);
  const drivesArray = Array.isArray(driveData) ? driveData : [driveData];

  return drivesArray.map((drive: { Name: string; Used?: number; Free?: number; Size?: number }): DiskInfo => {
    const size = drive.Size || 0;
    const used = drive.Used || 0;
    const available = drive.Free || 0;
    const percentage = size > 0 ? Math.round((used / size) * 100) : 0;

    return {
      filesystem: drive.Name + ':\\',
      size,
      used,
      available,
      percentage,
      mountpoint: drive.Name + ':\\',
      timestamp: new Date().toISOString(),
    };
  });
}

/** Drop pseudo / virtual filesystems that aren't real physical disks. */
export function filterPhysicalDisks(disks: DiskInfo[], platform: NodeJS.Platform): DiskInfo[] {
  if (platform === 'darwin') {
    return disks.filter(
      (disk) =>
        !disk.filesystem.startsWith('devfs') &&
        !disk.filesystem.startsWith('map') &&
        !disk.mountpoint.startsWith('/System/Volumes') &&
        disk.size > 0,
    );
  }

  if (platform === 'linux') {
    return disks.filter(
      (disk) =>
        !disk.filesystem.startsWith('/dev/loop') &&
        !disk.filesystem.startsWith('tmpfs') &&
        !disk.filesystem.startsWith('devtmpfs') &&
        disk.size > 0,
    );
  }

  return disks;
}

async function loadExecSync(): Promise<ExecSync | null> {
  /*
   * Only attempt the import in a real Node.js environment. In
   * Cloudflare/WebContainer this throws or `process.platform` is absent.
   */
  try {
    if (typeof process === 'undefined' || !process.platform) {
      return null;
    }

    const cp = await import('node:child_process');

    return cp.execSync as unknown as ExecSync;
  } catch {
    // child_process is unavailable in this environment, which is expected.
    return null;
  }
}

export const getDiskInfo = async (): Promise<DiskInfo[]> => {
  const execSync = await loadExecSync();

  if (!execSync) {
    return [unavailableRow()];
  }

  try {
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'linux') {
      try {
        const output = execSync('df -k', { encoding: 'utf-8' }).toString().trim();
        const disks = filterPhysicalDisks(parseDfOutput(output), platform);

        return disks;
      } catch (error) {
        console.error(`Failed to get ${platform} disk info:`, error);
        return [errorRow('/', error)];
      }
    } else if (platform === 'win32') {
      try {
        const output = execSync(
          'powershell "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free, @{Name=\'Size\';Expression={$_.Used + $_.Free}} | ConvertTo-Json"',
          { encoding: 'utf-8' },
        )
          .toString()
          .trim();

        return parsePowerShellOutput(output);
      } catch (error) {
        console.error('Failed to get Windows disk info:', error);
        return [errorRow('C:\\', error)];
      }
    } else {
      console.warn(`Unsupported platform: ${platform}`);
      return [
        {
          ...errorRow('/', new Error(`Unsupported platform: ${platform}`)),
          error: `Unsupported platform: ${platform}`,
        },
      ];
    }
  } catch (error) {
    console.error('Failed to get disk info:', error);
    return [errorRow('/', error)];
  }
};
