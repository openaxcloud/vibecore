import { describe, expect, it } from 'vitest';
import { getSettingsTabName, settingsTabTitle } from './settings-tab-title';

describe('settings tab title', () => {
  it('falls back to "Settings" when no slug is provided', () => {
    expect(getSettingsTabName()).toBe('Settings');
    expect(getSettingsTabName(null)).toBe('Settings');
    expect(getSettingsTabName('')).toBe('Settings');
  });

  it('maps known tab slugs to friendly canonical labels', () => {
    expect(getSettingsTabName('profile')).toBe('Profile');
    expect(getSettingsTabName('cloud-providers')).toBe('Cloud Providers');
    expect(getSettingsTabName('local-providers')).toBe('Local Providers');
    expect(getSettingsTabName('event-logs')).toBe('Event Logs');
    expect(getSettingsTabName('mcp')).toBe('MCP Servers');
  });

  it('resolves slug aliases to the canonical label', () => {
    expect(getSettingsTabName('providers')).toBe('Cloud Providers');
    expect(getSettingsTabName('local')).toBe('Local Providers');
    expect(getSettingsTabName('logs')).toBe('Event Logs');
    expect(getSettingsTabName('tasks')).toBe('Local data');
  });

  it('capitalizes unknown slugs instead of showing the raw slug', () => {
    expect(getSettingsTabName('something-new')).toBe('Something New');
    expect(getSettingsTabName('weird_slug')).toBe('Weird Slug');
  });

  it('builds a browser-tab title with the E-Code brand, never "Bolt"', () => {
    expect(settingsTabTitle('profile')).toBe('Profile | E-Code');
    expect(settingsTabTitle('cloud-providers')).toBe('Cloud Providers | E-Code');
    expect(settingsTabTitle()).toBe('Settings | E-Code');
    expect(settingsTabTitle('unknown-tab')).not.toContain('Bolt');
    expect(settingsTabTitle('unknown-tab')).toBe('Unknown Tab | E-Code');
  });
});
