import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhaseDictee } from './dictee-vocale';
import { IconButton } from '~/components/ui/IconButton';
import { getChatBoxChildrenCopy } from '~/lib/i18n/catalogs/chat-box-children';
import { classNames } from '~/utils/classNames';

/*
 * Feature-detect the Web Speech API once per page load (SSR-safe: only ever
 * evaluated in the browser). Browsers without it (e.g. Firefox) get no mic
 * button at all instead of a dead control.
 */
let speechRecognitionSupport: boolean | undefined;

function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (speechRecognitionSupport === undefined) {
    speechRecognitionSupport = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  return speechRecognitionSupport;
}

export const SpeechRecognitionButton = ({
  isListening,
  phase,
  onStart,
  onStop,
  disabled,
  triggerClassName,
  triggerLabel,
  triggerVariant = 'icon',
}: {
  isListening: boolean;
  phase?: PhaseDictee;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: 'icon' | 'menu';
}) => {
  const { i18n } = useTranslation();
  const copy = getChatBoxChildrenCopy(i18n.resolvedLanguage ?? i18n.language);
  const isMenuTrigger = triggerVariant === 'menu';
  const phaseEffective: PhaseDictee = phase ?? (isListening ? 'ecoute' : 'repos');

  /*
   * Starts false so the server render and the first client render agree
   * (no hydration mismatch); the effect then reveals the button only when
   * the browser actually implements the Web Speech API.
   */
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(isSpeechRecognitionSupported());
  }, []);

  if (!isSupported) {
    return null;
  }

  const title = isListening ? copy['chatBoxChildren.speech.stopTitle'] : copy['chatBoxChildren.speech.startTitle'];

  return (
    <IconButton
      title={title}
      tooltip={title}
      disabled={disabled}
      ariaPressed={isListening}
      dataState={phaseEffective}
      className={classNames(
        isMenuTrigger ? 'bolt-chatbox-tools-menu-item' : 'transition-all',
        'bolt-dictee-bouton',
        {
          'bolt-dictee-active': isListening,
        },
        triggerClassName,
      )}
      onClick={isListening ? onStop : onStart}
    >
      <>
        {/*
         * BUG-VOICE-INPUT-001 — pendant l'écoute, l'icône reste le MICRO, avec
         * un halo qui pulse : un micro barré se lit « micro coupé », l'inverse
         * de ce qui se passe. La pastille est aussi ce que voit un doigt sur
         * iPhone, où il n'y a ni survol ni infobulle.
         */}
        <span className="bolt-dictee-icone" aria-hidden>
          <div className="i-ph:microphone text-xl" />
          {isListening ? <span className="bolt-dictee-halo" data-phase={phaseEffective} /> : null}
        </span>
        {isMenuTrigger ? (
          <span className="min-w-0 !overflow-visible !whitespace-normal break-words leading-snug">
            {triggerLabel ??
              (isListening ? copy['chatBoxChildren.speech.stopLabel'] : copy['chatBoxChildren.speech.startLabel'])}
          </span>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {phaseEffective === 'ecoute'
            ? copy['chatBoxChildren.speech.listening']
            : phaseEffective === 'demande'
              ? copy['chatBoxChildren.speech.requesting']
              : ''}
        </span>
      </>
    </IconButton>
  );
};
