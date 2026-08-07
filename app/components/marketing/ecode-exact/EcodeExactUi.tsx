import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import * as React from 'react';
import { Link as RemixLink, useLocation, useNavigate } from 'react-router';
import { twMerge } from 'tailwind-merge';

import { getMarketingBrandCopy } from '~/lib/i18n/catalogs/marketing-brand';

function activeBrandLanguage(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.lang;
  }

  return 'en';
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BRAND = {
  name: 'E-Code',
  get tagline() {
    return getMarketingBrandCopy(activeBrandLanguage())['marketingBrand.tagline'];
  },
  get description() {
    return getMarketingBrandCopy(activeBrandLanguage())['marketingBrand.description'];
  },
  colors: {
    primary: '#F26207',
    primaryLight: '#FF6B35',
    primaryDark: '#D84315',
    accent: '#F77F00',

    // Brand rule: marketing accents are warm orange/amber (never off-brand violet/fuchsia).
    gradient: {
      primary: 'from-orange-500 to-amber-500',
      ai: 'from-amber-400 to-orange-600',
      code: 'from-orange-600 to-amber-500',
    },
  },
  assets: {
    logo: '/assets/logo.svg',
    heroImage: '/assets/hero-image.svg',
    aiAvatar: '/assets/ai-avatar.svg',
  },
} as const;

export const LazyMotionDiv = motion.div;

export function useMarketingNavigate() {
  const navigate = useNavigate();

  return (to: string) => navigate(to);
}

export function useWouterLocation() {
  const location = useLocation();
  const navigate = useNavigate();

  return [location.pathname, (to: string) => navigate(to)] as const;
}

export function usePublicAuth() {
  return { user: null as null };
}

export function Link({
  href,
  to,
  children,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href?: string;
  to?: string;
  children: React.ReactNode;
}) {
  const target = href ?? to ?? '#';

  if (/^https?:\/\//.test(target)) {
    return (
      <a href={target} {...props}>
        {children}
      </a>
    );
  }

  return (
    <RemixLink to={target} {...props}>
      {children}
    </RemixLink>
  );
}

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-110',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
        outline: 'border border-border bg-surface-solid hover:bg-surface-hover-solid hover:text-foreground',
        secondary: 'bg-surface-tertiary-solid text-foreground hover:bg-surface-hover-solid',
        ghost: 'hover:bg-surface-hover-solid hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 md:h-10 min-h-[44px] md:min-h-0',
        sm: 'h-9 rounded-md px-3 min-h-[44px] md:min-h-0',
        lg: 'h-11 rounded-md px-8 min-h-[44px] md:min-h-0',
        icon: 'h-10 w-10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const resolvedClassName = cn(buttonVariants({ variant, size }), 'replit-button-press', className);

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string } & React.HTMLAttributes<HTMLElement>>;
      const childProps = props as React.HTMLAttributes<HTMLElement>;

      return React.cloneElement(child, {
        ...childProps,
        className: cn(resolvedClassName, child.props.className),
      });
    }

    return (
      <button className={resolvedClassName} ref={ref} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ecode-accent)]',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-500 text-white hover:bg-green-500/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | null;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant: variant ?? undefined }), className)} {...props} />
));
Badge.displayName = 'Badge';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text)] shadow-sm transition-all duration-150 hover:shadow-md',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-3 text-[var(--ecode-text)]',
        className,
      )}
      {...props}
    />
  ),
);
Alert.displayName = 'Alert';

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[120px] w-full rounded-md border border-[var(--ecode-border)] bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-[var(--ecode-border)] bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

type RadioGroupContextValue = {
  name: string;
  value: string;
  setValue: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export const RadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    name?: string;
  }
>(({ className, value, defaultValue = '', onValueChange, name, ...props }, ref) => {
  const generatedName = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const selectedValue = value ?? internalValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue);
      }

      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  return (
    <RadioGroupContext.Provider value={{ name: name ?? generatedName, value: selectedValue, setValue }}>
      <div ref={ref} role="radiogroup" className={cn('grid gap-2', className)} {...props} />
    </RadioGroupContext.Provider>
  );
});
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'>
>(({ className, value, ...props }, ref) => {
  const context = React.useContext(RadioGroupContext);
  const stringValue = String(value ?? '');

  return (
    <input
      ref={ref}
      type="radio"
      name={context?.name}
      value={stringValue}
      checked={context?.value === stringValue}
      onChange={() => context?.setValue(stringValue)}
      className={cn(
        'h-4 w-4 shrink-0 appearance-none rounded-full border border-[var(--ecode-border)] bg-background shadow-sm ring-offset-background transition-colors checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_4px_var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
RadioGroupItem.displayName = 'RadioGroupItem';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-[var(--ecode-border)]', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('border-b border-[var(--ecode-border)] transition-colors hover:bg-muted/50', className)}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn('h-12 px-4 text-left align-middle font-medium text-muted-foreground', className)}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('p-4 align-middle', className)} {...props} />,
);
TableCell.displayName = 'TableCell';

export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('animate-pulse rounded-md bg-muted/60', className)} {...props} />
  ),
);
Skeleton.displayName = 'Skeleton';

export function instrumentedLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  _name: string,
) {
  return React.lazy(factory);
}

export function useDeferredRender({ rootMargin = '200px' }: { rootMargin?: string } = {}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = React.useState(false);

  React.useEffect(() => {
    if (shouldRender) {
      return undefined;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    const element = ref.current;

    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return { ref, shouldRender };
}

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-lg bg-background p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all hover:bg-surface-tertiary-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-solid data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export function Spinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-primary border-t-transparent',
        sizeClass,
        className,
      )}
    />
  );
}
