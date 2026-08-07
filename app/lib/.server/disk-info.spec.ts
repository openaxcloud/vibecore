import { describe, it, expect } from 'vitest';
import { getDiskInfo, parseDfOutput, parsePowerShellOutput, filterPhysicalDisks, type DiskInfo } from './disk-info';

describe('disk-info', () => {
  describe('getDiskInfo', () => {
    it('returns real disk rows on a Node host (not the unavailable placeholder)', async () => {
      /*
       * Regression test for the bug where execSync was hardcoded to null,
       * making getDiskInfo always short-circuit to the placeholder row.
       */
      const result = await getDiskInfo();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      /*
       * On a real Node host (CI runs on Linux/macOS) we must NOT get the
       * "not available in this environment" placeholder.
       */
      const platform = process.platform;

      if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
        expect(result[0].error).not.toBe('Disk information is not available in this environment');

        // At least one physical disk with a real size should be reported.
        const hasRealDisk = result.some((d) => d.size > 0);
        expect(hasRealDisk).toBe(true);
      }

      for (const disk of result) {
        expect(typeof disk.filesystem).toBe('string');
        expect(typeof disk.timestamp).toBe('string');
      }
    });

    it('uses French-safe fallback copy without leaking raw execution errors', async () => {
      const result = await getDiskInfo('fr');

      for (const disk of result) {
        if (disk.error) {
          expect(disk.error).not.toMatch(/unknown error|unsupported platform|disk information/i);
        }
      }
    });
  });

  describe('parseDfOutput', () => {
    it('parses df -k output and converts KB to bytes', () => {
      const output = [
        'Filesystem     1024-blocks      Used Available Capacity Mounted on',
        '/dev/disk1s1     244002488 100000000 144002488      41% /',
      ].join('\n');

      const disks = parseDfOutput(output);

      expect(disks).toHaveLength(1);
      expect(disks[0].filesystem).toBe('/dev/disk1s1');
      expect(disks[0].size).toBe(244002488 * 1024);
      expect(disks[0].used).toBe(100000000 * 1024);
      expect(disks[0].available).toBe(144002488 * 1024);
      expect(disks[0].percentage).toBe(41);
      expect(disks[0].mountpoint).toBe('/');
    });

    it('drops malformed lines without a filesystem or mountpoint', () => {
      const output = ['Filesystem 1024-blocks Used Available Capacity Mounted on', ''].join('\n');
      expect(parseDfOutput(output)).toHaveLength(0);
    });

    it('reads the real mountpoint from macOS 9-column df -k output (not the iused count)', () => {
      /*
       * Regression test: macOS `df -k` inserts iused/ifree/%iused columns
       * between Capacity and 'Mounted on', so the mountpoint is the LAST token,
       * not parts[5] (which is the iused count).
       */
      const output = [
        'Filesystem    1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on',
        '/dev/disk3s1s1  971350180  10000000 900000000     2%  400000 4000000000    0%   /',
        '/dev/disk3s6    971350180     50000 900000000     1%      30 4000000000    0%   /System/Volumes/VM',
      ].join('\n');

      const disks = parseDfOutput(output);

      expect(disks[0].mountpoint).toBe('/');
      expect(disks[0].mountpoint).not.toBe('400000');
      expect(disks[1].mountpoint).toBe('/System/Volumes/VM');
      expect(disks[0].size).toBe(971350180 * 1024);
      expect(disks[0].percentage).toBe(2);
    });

    it('darwin filter drops /System/Volumes mounts once the macOS mountpoint parses correctly', () => {
      const output = [
        'Filesystem    1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on',
        '/dev/disk3s1s1  971350180  10000000 900000000     2%  400000 4000000000    0%   /',
        '/dev/disk3s6    971350180     50000 900000000     1%      30 4000000000    0%   /System/Volumes/VM',
        'devfs                 200       200         0   100%     400          0  100%   /dev',
      ].join('\n');

      const physical = filterPhysicalDisks(parseDfOutput(output), 'darwin');

      expect(physical).toHaveLength(1);
      expect(physical[0].mountpoint).toBe('/');
      expect(physical[0].filesystem).toBe('/dev/disk3s1s1');
    });
  });

  describe('parsePowerShellOutput', () => {
    it('parses a single-drive JSON object', () => {
      const output = JSON.stringify({ Name: 'C', Used: 50, Free: 50, Size: 100 });
      const disks = parsePowerShellOutput(output);

      expect(disks).toHaveLength(1);
      expect(disks[0].filesystem).toBe('C:\\');
      expect(disks[0].percentage).toBe(50);
    });

    it('parses a multi-drive JSON array', () => {
      const output = JSON.stringify([
        { Name: 'C', Used: 75, Free: 25, Size: 100 },
        { Name: 'D', Used: 0, Free: 0, Size: 0 },
      ]);

      const disks = parsePowerShellOutput(output);

      expect(disks).toHaveLength(2);
      expect(disks[1].percentage).toBe(0);
    });
  });

  describe('filterPhysicalDisks', () => {
    const make = (filesystem: string, mountpoint: string, size = 1000): DiskInfo => ({
      filesystem,
      mountpoint,
      size,
      used: 0,
      available: size,
      percentage: 0,
      timestamp: new Date().toISOString(),
    });

    it('filters macOS pseudo filesystems', () => {
      const disks = [make('/dev/disk1s1', '/'), make('devfs', '/dev'), make('map auto_home', '/System/Volumes/Data')];

      const filtered = filterPhysicalDisks(disks, 'darwin');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].filesystem).toBe('/dev/disk1s1');
    });

    it('filters Linux pseudo filesystems', () => {
      const disks = [make('/dev/sda1', '/'), make('tmpfs', '/run'), make('/dev/loop0', '/snap')];
      const filtered = filterPhysicalDisks(disks, 'linux');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].filesystem).toBe('/dev/sda1');
    });
  });
});
