import { useStore } from '@nanostores/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode } from 'react-qrcode-logo';
import { Dialog, DialogTitle, DialogDescription, DialogRoot } from '~/components/ui/Dialog';
import { getWorkspaceMiscCopy } from '~/lib/i18n/catalogs/workspace-misc';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';

interface ExpoQrModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExpoQrModal: React.FC<ExpoQrModalProps> = ({ open, onClose }) => {
  const { i18n } = useTranslation();
  const copy = getWorkspaceMiscCopy(i18n.resolvedLanguage ?? i18n.language);
  const expoUrl = useStore(expoUrlAtom);

  return (
    <DialogRoot open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog className="!mx-auto !max-w-md !flex-col text-center" showCloseButton={true} onClose={onClose}>
        <div className="flex min-w-0 flex-col items-center justify-center gap-5 rounded-md border !border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
          <div className="i-bolt:expo-brand h-10 w-full invert dark:invert-none"></div>
          <DialogTitle className="max-w-full justify-center break-words text-lg font-semibold leading-6 text-bolt-elements-textPrimary">
            {copy['workspaceMisc.expo.title']}
          </DialogTitle>
          <DialogDescription className="max-w-sm break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 leading-5">
            {copy['workspaceMisc.expo.description']}
          </DialogDescription>
          <div className="my-4 flex max-w-full flex-col items-center sm:my-6">
            {expoUrl ? (
              <div role="img" aria-label={copy['workspaceMisc.expo.qr.aria']} className="max-w-full overflow-hidden">
                <QRCode
                  logoImage="/favicon.svg"
                  removeQrCodeBehindLogo={true}
                  logoPadding={3}
                  logoHeight={50}
                  logoWidth={50}
                  logoPaddingStyle="square"
                  style={{
                    borderRadius: 16,
                    padding: 2,
                    backgroundColor: '#0099ff',
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                  value={expoUrl}
                  size={200}
                />
              </div>
            ) : (
              <p role="status" className="max-w-full break-words text-center text-bolt-elements-textSecondary">
                {copy['workspaceMisc.expo.empty']}
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
};
