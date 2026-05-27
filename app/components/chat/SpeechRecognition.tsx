import React from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

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
