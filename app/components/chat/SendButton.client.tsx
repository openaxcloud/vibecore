import { AnimatePresence, cubicBezier, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  variant?: 'overlay' | 'toolbar';
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, isStreaming, disabled, variant = 'overlay', onClick }: SendButtonProps) => {
  const { i18n } = useTranslation();
  const copy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const isToolbarVariant = variant === 'toolbar';
  const accessibleLabel = isStreaming ? copy['clientAst.chat.send.stop'] : copy['clientAst.chat.send.message'];

  const buttonClassName = isToolbarVariant
    ? 'bolt-composer-send-button bolt-composer-send-button-toolbar relative z-20 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--vc-action-primary)] p-1 text-[var(--vc-action-primary-foreground)] shadow-sm transition-theme hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-50'
    : 'bolt-composer-send-button absolute bottom-2 right-2 z-20 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--vc-action-primary)] p-1 text-[var(--vc-action-primary-foreground)] shadow-sm transition-theme hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          type="button"
          className={buttonClassName}
          aria-label={accessibleLabel}
          title={accessibleLabel}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          style={
            isToolbarVariant
              ? { position: 'relative' }
              : {
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                }
          }
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();

            if (!disabled) {
              onClick?.(event);
            }
          }}
        >
          <div className="text-lg">
            {!isStreaming ? <div className="i-ph:arrow-right"></div> : <div className="i-ph:stop-circle-bold"></div>}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
