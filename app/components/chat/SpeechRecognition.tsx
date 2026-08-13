import React, { useEffect, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
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
      title={isListening ? 'Stop listening' : 'Start speech recognition'}
      tooltip={isListening ? 'Stop listening' : 'Start speech recognition'}
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
        {isMenuTrigger ? <span>{triggerLabel ?? (isListening ? 'Stop speech' : 'Speech')}</span> : null}
      </>
    </IconButton>
  );
};
