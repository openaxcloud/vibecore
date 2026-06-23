import { describe, expect, it } from 'vitest';
import { DESKTOP_DOWNLOAD_BASE, desktopDownloadUrl } from './desktop-download';

describe('desktopDownloadUrl', () => {
  it('derives a same-origin download URL from the artifact filename', () => {
    expect(desktopDownloadUrl('E-Code.dmg')).toBe('/download/desktop/E-Code.dmg');
    expect(desktopDownloadUrl('E-Code-Setup.exe')).toBe('/download/desktop/E-Code-Setup.exe');
    expect(desktopDownloadUrl('E-Code.AppImage')).toBe('/download/desktop/E-Code.AppImage');
  });

  it('always returns a non-empty, navigable href for each per-OS artifact', () => {
    for (const file of ['E-Code.dmg', 'E-Code-Setup.exe', 'E-Code.AppImage']) {
      const url = desktopDownloadUrl(file);
      expect(url.startsWith(DESKTOP_DOWNLOAD_BASE)).toBe(true);
      expect(url.length).toBeGreaterThan(DESKTOP_DOWNLOAD_BASE.length + 1);
    }
  });

  it('trims surrounding whitespace from the filename', () => {
    expect(desktopDownloadUrl('  E-Code.dmg  ')).toBe('/download/desktop/E-Code.dmg');
  });

  it('strips leading slashes so a filename cannot escape the base path', () => {
    expect(desktopDownloadUrl('/etc/passwd')).toBe('/download/desktop/etc%2Fpasswd');
    expect(desktopDownloadUrl('///E-Code.dmg')).toBe('/download/desktop/E-Code.dmg');
  });

  it('percent-encodes characters that are unsafe in a path segment', () => {
    expect(desktopDownloadUrl('E Code v1.dmg')).toBe('/download/desktop/E%20Code%20v1.dmg');
  });

  it('falls back to the releases index for an empty filename', () => {
    expect(desktopDownloadUrl('')).toBe(DESKTOP_DOWNLOAD_BASE);
    expect(desktopDownloadUrl('   ')).toBe(DESKTOP_DOWNLOAD_BASE);
  });
});
