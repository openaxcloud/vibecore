import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  onStart,
  onStop,
  disabled,
  triggerClassName,
  triggerLabel,
  triggerVariant = 'icon',
}: {
  isListening: boolean;
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

  return (
    <IconButton
      title={isListening ? copy['chatBoxChildren.speech.stopTitle'] : copy['chatBoxChildren.speech.startTitle']}
      tooltip={isListening ? copy['chatBoxChildren.speech.stopTitle'] : copy['chatBoxChildren.speech.startTitle']}
      disabled={disabled}
      className={classNames(
        isMenuTrigger ? 'bolt-chatbox-tools-menu-item' : 'transition-all',
        {
          'text-bolt-elements-item-contentAccent': isListening,
        },
        triggerClassName,
      )}
      onClick={isListening ? onStop : onStart}
    >
      <>
        {isListening ? <div className="i-ph:microphone-slash text-xl" /> : <div className="i-ph:microphone text-xl" />}
        {isMenuTrigger ? (
          <span className="min-w-0 !overflow-visible !whitespace-normal break-words leading-snug">
            {triggerLabel ??
              (isListening ? copy['chatBoxChildren.speech.stopLabel'] : copy['chatBoxChildren.speech.startLabel'])}
          </span>
        ) : null}
      </>
    </IconButton>
  );
};
