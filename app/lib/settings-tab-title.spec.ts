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
    expect(getSettingsTabName('cloud-providers')).toBe('Cloud providers');
    expect(getSettingsTabName('local-providers')).toBe('Local providers');
    expect(getSettingsTabName('event-logs')).toBe('Event logs');
    expect(getSettingsTabName('mcp')).toBe('MCP servers');
    expect(getSettingsTabName('profile', 'fr')).toBe('Profil');
    expect(getSettingsTabName('cloud-providers', 'fr')).toBe('Fournisseurs cloud');
    expect(getSettingsTabName('event-logs', 'fr')).toBe('Journaux d’événements');
  });

  it('resolves slug aliases to the canonical label', () => {
    expect(getSettingsTabName('providers')).toBe('Cloud providers');
    expect(getSettingsTabName('local')).toBe('Local providers');
    expect(getSettingsTabName('logs')).toBe('Event logs');
    expect(getSettingsTabName('tasks')).toBe('Local data');
  });

  it('uses a localized safe label instead of rendering unknown implementation slugs', () => {
    expect(getSettingsTabName('something-new')).toBe('Settings');
    expect(getSettingsTabName('weird_slug', 'fr')).toBe('Paramètres');
  });

  it('builds a browser-tab title with the E-Code brand, never "Bolt"', () => {
    expect(settingsTabTitle('profile')).toBe('Profile | E-Code');
    expect(settingsTabTitle('cloud-providers')).toBe('Cloud providers | E-Code');
    expect(settingsTabTitle()).toBe('Settings | E-Code');
    expect(settingsTabTitle('unknown-tab')).not.toContain('Bolt');
    expect(settingsTabTitle('unknown-tab')).toBe('Settings | E-Code');
    expect(settingsTabTitle('profile', 'fr')).toBe('Profil | E-Code');
    expect(settingsTabTitle('unknown-tab', 'fr')).toBe('Paramètres | E-Code');
  });
});
