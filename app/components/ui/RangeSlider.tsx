import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
import { classNames } from '~/utils/classNames';

const RangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { i18n } = useTranslation();
  const copy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={classNames('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-bolt-elements-item-contentAccent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={classNames(
          'block h-5 w-5 rounded-full border-2 border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-1 shadow-md outline-none transition-colors',
          'hover:bg-bolt-elements-background-depth-2 focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive/35',
          'disabled:pointer-events-none disabled:opacity-45',
        )}
        aria-label={props['aria-label'] ?? copy['clientAst.ui.slider.value']}
      />
    </SliderPrimitive.Root>
  );
});
RangeSlider.displayName = SliderPrimitive.Root.displayName;

export { RangeSlider };
