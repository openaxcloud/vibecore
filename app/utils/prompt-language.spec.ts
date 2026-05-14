import { describe, expect, it } from 'vitest';
import { LANGUAGE_DETECTION_MIN_CHARS, SUPPORTED_LANGUAGES, detectPromptLanguage } from './prompt-language';

describe('detectPromptLanguage', () => {
  it('returns und / unreliable for null / undefined / empty input', () => {
    expect(detectPromptLanguage(null)).toEqual({ code: 'und', reliable: false });
    expect(detectPromptLanguage(undefined)).toEqual({ code: 'und', reliable: false });
    expect(detectPromptLanguage('')).toEqual({ code: 'und', reliable: false });
  });

  it('refuses to guess on input shorter than the threshold', () => {
    expect(detectPromptLanguage('Hi there')).toEqual({ code: 'und', reliable: false });
    expect(LANGUAGE_DETECTION_MIN_CHARS).toBeGreaterThan(0);
  });

  it('identifies English prose reliably', () => {
    const result = detectPromptLanguage(
      'Build a polished portfolio website with case studies, blog posts, and contact forms.',
    );
    expect(result.code).toBe('eng');
    expect(result.name).toBe('English');
    expect(result.reliable).toBe(true);
  });

  it('identifies French prose reliably', () => {
    const result = detectPromptLanguage(
      "Construire une application de gestion de tâches avec authentification, équipes et tableau de bord d'analytique.",
    );
    expect(result.code).toBe('fra');
    expect(result.name).toBe('French');
    expect(result.reliable).toBe(true);
  });

  it('identifies Spanish prose reliably', () => {
    const result = detectPromptLanguage(
      'Construir una plataforma de comercio electrónico con filtros, carrito de compras y pago integrado.',
    );
    expect(result.code).toBe('spa');
    expect(result.name).toBe('Spanish');
    expect(result.reliable).toBe(true);
  });

  it('identifies German prose reliably', () => {
    const result = detectPromptLanguage(
      'Entwickle eine Webanwendung zur Verwaltung von Aufgaben mit Authentifizierung und Teamfunktionen.',
    );
    expect(result.code).toBe('deu');
    expect(result.name).toBe('German');
    expect(result.reliable).toBe(true);
  });

  it('identifies Portuguese prose reliably', () => {
    const result = detectPromptLanguage(
      'Construir uma aplicação web para gerenciar tarefas, com autenticação, equipes e painel de análises.',
    );
    expect(result.code).toBe('por');
    expect(result.name).toBe('Portuguese');
    expect(result.reliable).toBe(true);
  });

  it('exposes the SUPPORTED_LANGUAGES table for callers building <option> lists', () => {
    expect(Object.keys(SUPPORTED_LANGUAGES).length).toBeGreaterThan(10);
    expect(SUPPORTED_LANGUAGES.fra).toBe('French');
    expect(SUPPORTED_LANGUAGES.eng).toBe('English');
  });

  it('marks reliable=false when the detected code is not in SUPPORTED_LANGUAGES', () => {
    /*
     * Esperanto in franc maps to 'epo', which we don't surface as a UI hint;
     * the result still carries the code so downstream telemetry can log it.
     */
    const result = detectPromptLanguage(
      'Saluton mondo mi volas konstrui aplikajon por administri taskojn kun ensaluto kaj teamfunkcioj.',
    );
    expect(result.reliable).toBe(false);
    expect(result.name).toBeUndefined();
    expect(result.code).not.toBe('und');
  });
});
