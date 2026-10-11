import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-VOICE-INPUT-001 — le câblage de la dictée, ancré sur le code.
 *
 * La logique est sous test dans dictee-vocale.spec.ts ; ici on vérifie que
 * les composants s'en servent vraiment, parce que le défaut d'origine était
 * précisément un câblage incomplet : un moteur écouté sur `result` et `error`
 * seulement, jamais sur `end` ni `start`.
 */
const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const bouton = readFileSync(new URL('./SpeechRecognition.tsx', import.meta.url), 'utf8');
const chatBox = readFileSync(new URL('./ChatBox.tsx', import.meta.url), 'utf8');
const scss = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');

describe('dictée vocale — câblage du moteur dans BaseChat', () => {
  it('écoute la fin du moteur : quand il s’arrête seul, l’interface revient au repos', () => {
    expect(baseChat).toMatch(/recognition\.onend = \(\) => transiter\(\{ type: 'end' \}\)/);
    expect(baseChat).toMatch(/recognition\.onstart = \(\) => transiter\(\{ type: 'start' \}\)/);
  });

  it('donne au moteur la langue de l’interface avant de démarrer', () => {
    expect(baseChat).toMatch(
      /moteur\.lang = langueDeDictee\(i18n\.resolvedLanguage \?\? i18n\.language\);\s*[\s\S]{0,300}moteur\.start\(\)/,
    );
  });

  it('prolonge le texte déjà tapé au lieu de l’effacer', () => {
    expect(baseChat).toContain('prefixeDicteeRef.current = inputCourantRef.current;');
    expect(baseChat).toMatch(/composerLaSaisie\(prefixeDicteeRef\.current, transcription\)/);
  });

  it('n’a plus d’état booléen parallèle à la phase', () => {
    expect(baseChat).not.toContain('setIsListening(');
    expect(baseChat).toContain("const isListening = phaseDictee !== 'repos';");
  });

  it('traduit chaque erreur utile du moteur en message, et se tait sur les autres', () => {
    expect(baseChat).toContain("t('chat.copy.dictationNoMicrophone')");
    expect(baseChat).toContain("t('chat.copy.dictationNetwork')");
    expect(baseChat).toContain("t('chat.copy.dictationNoSpeech')");
  });
});

describe('dictée vocale — ce que l’on voit', () => {
  it('le bouton garde l’icône micro pendant l’écoute (un micro barré se lit « coupé ») et le dit à l’assistance', () => {
    expect(bouton).not.toContain('microphone-slash');
    expect(bouton).toContain('ariaPressed={isListening}');
    expect(bouton).toMatch(/<span className="bolt-dictee-halo" data-phase=\{phaseEffective\} \/>/);
    expect(bouton).toMatch(/role="status" aria-live="polite"/);
  });

  it('le champ dit ce qui se passe et comment arrêter', () => {
    expect(chatBox).toMatch(
      /props\.dictationPhase === 'ecoute'\s*\?\s*copy\['chatBox\.speech\.listeningPlaceholder'\]\s*:\s*props\.dictationPhase === 'demande'\s*\?\s*copy\['chatBox\.speech\.requestingPlaceholder'\]/,
    );
  });

  it('le halo pulse pendant l’écoute, sans dépendre du survol, et se fige en mouvement réduit', () => {
    expect(scss).toMatch(
      /\.bolt-dictee-bouton \.bolt-dictee-halo\[data-phase='ecoute'\] \{\s*animation: bolt-dictee-pulse/,
    );
    expect(scss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.bolt-dictee-bouton \.bolt-dictee-halo\[data-phase='ecoute'\] \{\s*animation: none;/,
    );

    const actif = scss.match(/\.bolt-chatbox-toolbar-button\.bolt-dictee-active,[\s\S]*?\n\}/)?.[0] ?? '';

    expect(actif).toContain('border-color: var(--vc-ide-accent-danger, #dc2626);');
    expect(actif).toContain('color: var(--vc-ide-accent-danger, #dc2626);');
  });
});
