import * as RadixPopover from '@radix-ui/react-popover';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { seedColorSchemeState } from './color-scheme-state';
import {
  formatDesignPaletteCopy,
  formatDesignPaletteNumber,
  getDesignPaletteCopy,
  type DesignPaletteKey,
} from '~/lib/i18n/catalogs/design-palette';
import type { DesignScheme } from '~/types/design-scheme';
import { defaultDesignScheme, designFeatures, designFonts, paletteRoles } from '~/types/design-scheme';
import { classNames } from '~/utils/classNames';

export interface ColorSchemeDialogProps {
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: 'icon' | 'menu';
}

type DesignPaletteSection = 'colors' | 'typography' | 'features';

const DESIGN_PALETTE_TABS = [
  { key: 'colors', labelKey: 'designPalette.section.colors', icon: 'i-ph:palette' },
  { key: 'typography', labelKey: 'designPalette.section.typography', icon: 'i-ph:text-aa' },
  { key: 'features', labelKey: 'designPalette.section.features', icon: 'i-ph:magic-wand' },
] satisfies ReadonlyArray<{ key: DesignPaletteSection; labelKey: DesignPaletteKey; icon: string }>;

export const ColorSchemeDialog: React.FC<ColorSchemeDialogProps> = ({
  setDesignScheme,
  designScheme,
  triggerClassName,
  triggerLabel,
  triggerVariant = 'icon',
}) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDesignPaletteCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatDesignPaletteCopy(template, values);

  const resolvedTriggerLabel = triggerLabel ?? copy['designPalette.trigger'];
  const initialState = seedColorSchemeState(designScheme);
  const [palette, setPalette] = useState<{ [key: string]: string }>(initialState.palette);
  const [features, setFeatures] = useState<string[]>(initialState.features);
  const [font, setFont] = useState<string[]>(initialState.font);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<DesignPaletteSection>('colors');

  // Re-seed local editing state from the current designScheme prop.
  const resetLocalState = React.useCallback(() => {
    const next = seedColorSchemeState(designScheme);
    setPalette(next.palette);
    setFeatures(next.features);
    setFont(next.font);
  }, [designScheme]);

  useEffect(() => {
    resetLocalState();
  }, [resetLocalState]);

  const handleColorChange = (role: string, value: string) => {
    setPalette((prev) => ({ ...prev, [role]: value }));
  };

  const handleFeatureToggle = (key: string) => {
    setFeatures((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const handleFontToggle = (key: string) => {
    setFont((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const handleSave = () => {
    setDesignScheme?.({ palette, features, font });
    setIsDialogOpen(false);
  };

  const handleReset = () => {
    setPalette(defaultDesignScheme.palette);
    setFeatures(defaultDesignScheme.features);
    setFont(defaultDesignScheme.font);
  };

  const isMenuTrigger = triggerVariant === 'menu';

  const renderColorSection = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-bolt-elements-item-contentAccent"></div>
          {copy['designPalette.colorPalette']}
        </h3>
        <button
          onClick={handleReset}
          className="text-sm bg-transparent hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary rounded-lg flex items-center gap-2 transition-all duration-200"
        >
          <span className="i-ph:arrow-clockwise text-sm" />
          {copy['designPalette.reset']}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
        {paletteRoles.map((role) => (
          <div
            key={role.key}
            className="group flex items-center gap-4 p-4 rounded-xl bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2 border border-transparent hover:border-bolt-elements-borderColor transition-all duration-200"
          >
            <div className="relative flex-shrink-0">
              <div
                className="w-12 h-12 rounded-xl shadow-md cursor-pointer transition-all duration-200 hover:scale-110 ring-2 ring-transparent hover:ring-bolt-elements-borderColorActive"
                style={{ backgroundColor: palette[role.key] }}
                onClick={() => document.getElementById(`color-input-${role.key}`)?.click()}
                onKeyDown={(e) => {
                  /*
                   * role=button + tabIndex=0 but only onClick — keyboard users couldn't
                   * activate the swatch. Enter/Space opens the native color picker.
                   */
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    document.getElementById(`color-input-${role.key}`)?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={text(copy['designPalette.changeColor'], { role: copy[role.labelKey] })}
              />
              <input
                id={`color-input-${role.key}`}
                type="color"
                value={palette[role.key]}
                onChange={(e) => handleColorChange(role.key, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                tabIndex={-1}
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-bolt-elements-background-depth-1 rounded-full flex items-center justify-center shadow-sm">
                <span className="i-ph:pencil-simple text-xs text-bolt-elements-textSecondary" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-bolt-elements-textPrimary transition-colors">
                {copy[role.labelKey]}
              </div>
              <div className="text-sm text-bolt-elements-textSecondary line-clamp-2 leading-relaxed">
                {copy[role.descriptionKey]}
              </div>
              <div className="text-xs text-bolt-elements-textTertiary font-mono mt-1 px-2 py-1 bg-bolt-elements-background-depth-1 rounded-md inline-block">
                {palette[role.key]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTypographySection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-bolt-elements-item-contentAccent"></div>
        {copy['designPalette.section.typography']}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
        {designFonts.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => handleFontToggle(f.key)}
            className={`group p-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive ${
              font.includes(f.key)
                ? 'bg-bolt-elements-item-backgroundAccent border-bolt-elements-borderColorActive shadow-lg'
                : 'bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-2'
            }`}
          >
            <div className="text-center space-y-2">
              <div
                className={`text-2xl font-medium transition-colors ${
                  font.includes(f.key) ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textPrimary'
                }`}
                style={{ fontFamily: f.key }}
              >
                {f.preview}
              </div>
              <div
                className={`text-sm font-medium transition-colors ${
                  font.includes(f.key) ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textSecondary'
                }`}
              >
                {copy[f.labelKey]}
              </div>
              {font.includes(f.key) && (
                <div className="w-6 h-6 mx-auto bg-bolt-elements-item-contentAccent rounded-full flex items-center justify-center">
                  <span className="i-ph:check text-white text-sm" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderFeaturesSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-bolt-elements-item-contentAccent"></div>
        {copy['designPalette.designFeatures']}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
        {designFeatures.map((f) => {
          const isSelected = features.includes(f.key);

          return (
            <div key={f.key} className="feature-card-container p-2">
              <button
                type="button"
                onClick={() => handleFeatureToggle(f.key)}
                className={`group relative w-full p-6 text-sm font-medium transition-all duration-200 bg-bolt-elements-background-depth-3 text-bolt-elements-item-textSecondary ${
                  f.key === 'rounded'
                    ? isSelected
                      ? 'rounded-3xl'
                      : 'rounded-xl'
                    : f.key === 'border'
                      ? 'rounded-lg'
                      : 'rounded-xl'
                } ${
                  f.key === 'border'
                    ? isSelected
                      ? 'border-3 border-bolt-elements-borderColorActive bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                      : 'border-2 border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive text-bolt-elements-textSecondary'
                    : f.key === 'gradient'
                      ? ''
                      : isSelected
                        ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent shadow-lg'
                        : 'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                } ${f.key === 'shadow' ? (isSelected ? 'shadow-xl' : 'shadow-lg') : 'shadow-md'}`}
                style={{
                  ...(f.key === 'gradient' && {
                    background: isSelected
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                      : 'var(--bolt-elements-bg-depth-3)',
                    color: isSelected ? 'white' : 'var(--bolt-elements-textSecondary)',
                  }),
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-bolt-elements-background-depth-1 bg-opacity-20">
                    {f.key === 'rounded' && (
                      <div
                        className={`w-6 h-6 bg-current transition-all duration-200 ${
                          isSelected ? 'rounded-full' : 'rounded'
                        } opacity-80`}
                      />
                    )}
                    {f.key === 'border' && (
                      <div
                        className={`w-6 h-6 rounded-lg transition-all duration-200 ${
                          isSelected ? 'border-3 border-current opacity-90' : 'border-2 border-current opacity-70'
                        }`}
                      />
                    )}
                    {f.key === 'gradient' && (
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-400 via-pink-400 to-sky-400 opacity-90" />
                    )}
                    {f.key === 'shadow' && (
                      <div className="relative">
                        <div
                          className={`w-6 h-6 bg-current rounded-lg transition-all duration-200 ${
                            isSelected ? 'opacity-90' : 'opacity-70'
                          }`}
                        />
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-current rounded-lg transition-all duration-200 ${
                            isSelected ? 'opacity-40' : 'opacity-30'
                          }`}
                        />
                      </div>
                    )}
                    {f.key === 'frosted-glass' && (
                      <div className="relative">
                        <div
                          className={`w-6 h-6 rounded-lg transition-all duration-200 backdrop-blur-sm bg-white/20 border border-white/30 ${
                            isSelected ? 'opacity-90' : 'opacity-70'
                          }`}
                        />
                        <div
                          className={`absolute inset-0 w-6 h-6 rounded-lg transition-all duration-200 backdrop-blur-md bg-gradient-to-br from-white/10 to-transparent ${
                            isSelected ? 'opacity-60' : 'opacity-40'
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  <div className="text-center">
                    <div className="font-semibold">{copy[f.labelKey]}</div>
                    {isSelected && <div className="mt-2 w-8 h-1 bg-current rounded-full mx-auto opacity-60" />}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <RadixPopover.Root
        open={isDialogOpen}
        onOpenChange={(open) => {
          /*
           * Re-seed local state from the current prop whenever the dialog opens
           * so that edits abandoned via Cancel are discarded rather than shown
           * (and silently committed) on the next open.
           */
          if (open) {
            resetLocalState();
          }

          setIsDialogOpen(open);
        }}
      >
        <RadixPopover.Trigger asChild>
          <IconButton
            title={copy['designPalette.title']}
            tooltip={copy['designPalette.title']}
            className={classNames(isMenuTrigger ? 'bolt-chatbox-tools-menu-item' : 'transition-all', triggerClassName)}
            onClick={() => setIsDialogOpen((open) => !open)}
          >
            <>
              <div className="i-ph:palette text-xl"></div>
              {isMenuTrigger ? <span>{resolvedTriggerLabel}</span> : null}
            </>
          </IconButton>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            hideWhenDetached
            className="z-[9999] w-[min(520px,calc(100vw-24px))] max-h-[min(620px,calc(100dvh-64px))] overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-xl"
          >
            <div className="flex max-h-[min(620px,calc(100dvh-64px))] min-h-0 flex-col gap-4 px-4 py-4 overflow-hidden">
              <div className="pr-8">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
                  <span className="i-ph:palette text-bolt-elements-item-contentAccent text-xl" aria-hidden />
                  {copy['designPalette.title']}
                </h2>
                <p className="text-xs text-bolt-elements-textSecondary leading-snug mt-1">
                  {copy['designPalette.description']}
                </p>
              </div>

              {/* Navigation Tabs */}
              <div className="flex gap-1 p-1 bg-bolt-elements-background-depth-3 rounded-lg">
                {DESIGN_PALETTE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveSection(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-colors duration-150 ${
                      activeSection === tab.key
                        ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                        : 'bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2'
                    }`}
                  >
                    <span className={`${tab.icon} text-base`} aria-hidden />
                    <span>{copy[tab.labelKey]}</span>
                  </button>
                ))}
              </div>

              {/* Content Area */}
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
                {activeSection === 'colors' && renderColorSection()}
                {activeSection === 'typography' && renderTypographySection()}
                {activeSection === 'features' && renderFeaturesSection()}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-bolt-elements-borderColor">
                <div className="text-[11px] text-bolt-elements-textSecondary">
                  {text(copy['designPalette.summary'], {
                    colors: formatDesignPaletteNumber(Object.keys(palette).length, language),
                    fonts: formatDesignPaletteNumber(font.length, language),
                    features: formatDesignPaletteNumber(features.length, language),
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      resetLocalState();
                      setIsDialogOpen(false);
                    }}
                  >
                    {copy['designPalette.cancel']}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleSave}
                    className="bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text"
                  >
                    {copy['designPalette.save']}
                  </Button>
                </div>
              </div>
            </div>
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>

      <style>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: var(--bolt-elements-textTertiary) transparent;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: var(--bolt-elements-textTertiary);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: var(--bolt-elements-textSecondary);
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .feature-card-container {
          min-height: 140px;
          display: flex;
          align-items: stretch;
        }
        .feature-card-container button {
          flex: 1;
        }
      `}</style>
    </div>
  );
};
