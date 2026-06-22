import { describe, it, expect } from 'vitest';
import { parseSavedConnection } from './supabase';

describe('parseSavedConnection', () => {
  it('returns default state when raw is null', () => {
    const state = parseSavedConnection(null);
    expect(state.token).toBe('');
    expect(state.user).toBeNull();
    expect(state.isConnected).toBe(false);
  });

  it('returns default state for the literal "null" (must not crash module init)', () => {
    /*
     * JSON.parse('null') === null; before the fix this made initialState null and
     * `initialState.token` threw a TypeError at module load.
     */
    const state = parseSavedConnection('null');
    expect(state).not.toBeNull();
    expect(typeof state).toBe('object');
    expect(state.token).toBe('');
  });

  it('returns default state for a numeric primitive', () => {
    const state = parseSavedConnection('42');
    expect(state).not.toBeNull();
    expect(state.token).toBe('');
  });

  it('returns default state for a JSON array', () => {
    const state = parseSavedConnection('[1,2,3]');
    expect(Array.isArray(state)).toBe(false);
    expect(state.token).toBe('');
  });

  it('returns default state for a JSON string primitive', () => {
    const state = parseSavedConnection('"hello"');
    expect(typeof state).toBe('object');
    expect(state.token).toBe('');
  });

  it('returns default state for syntactically invalid JSON', () => {
    const state = parseSavedConnection('{not valid json');
    expect(state.token).toBe('');
  });

  it('returns the parsed object for a valid connection shape', () => {
    const raw = JSON.stringify({ user: null, token: 'abc', isConnected: true });
    const state = parseSavedConnection(raw);
    expect(state.token).toBe('abc');
    expect(state.isConnected).toBe(true);
  });
});
