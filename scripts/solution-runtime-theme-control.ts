import { expect, type Frame, type Locator, type Page } from '@playwright/test';

export type RuntimeCaptureTheme = 'light' | 'dark';

type RuntimeThemeSnapshot = {
  computedColorScheme: string;
  dataTheme: string | null;
  prefersDark: boolean;
  prefersLight: boolean;
  rootClasses: string[];
  themeControls: Array<{
    ariaLabel: string | null;
    ariaPressed: string | null;
    disabled: boolean;
    role: string | null;
    tag: string;
    text: string;
    title: string | null;
    type: string | null;
    visible: boolean;
  }>;
};

const THEME_CLASS_PATTERN = /^(?:(dark|light)|(?:theme|mode)[-_](dark|light)|(dark|light)[-_](?:theme|mode))$/i;

const THEME_CONTROL_LABELS = {
  en: {
    dark: 'Switch to light mode',
    light: 'Switch to dark mode',
  },
  fr: {
    dark: 'Passer en mode clair',
    light: 'Passer en mode sombre',
  },
} as const;

export type RuntimeThemeLocale = keyof typeof THEME_CONTROL_LABELS;

export const OFFICIAL_RUNTIME_THEME_CONTROL_LABEL =
  /^(?:Switch to light mode|Switch to dark mode|Passer en mode clair|Passer en mode sombre)$/u;

const IDE_SHELL_SHORTCUT_FOCUS_SELECTOR = '.bolt-project-statusbar:visible button:visible:not([disabled])';
const DESKTOP_IDE_SELECTOR = '.bolt-responsive-ide-desktop:visible';

/**
 * Return keyboard ownership to the top-level IDE before invoking its global
 * command-palette shortcut. A click on a generated app's theme control leaves
 * `document.activeElement` on the Preview iframe, where key events cannot
 * bubble into the parent window's production keybinding listener.
 *
 * Focusing an existing status-bar button is deterministic and side-effect
 * free: unlike clicking it, this does not open another panel or mutate IDE
 * state. The following key press still exercises the real production shortcut.
 */
export async function pressIdeCommandPaletteShortcut(page: Page, timeoutMs = 30_000) {
  try {
    await expect(page.locator(DESKTOP_IDE_SELECTOR)).toBeVisible({ timeout: timeoutMs });
  } catch (error) {
    throw new Error(
      'The keyboard command-palette path is available only in the hydrated desktop IDE shell; compact layouts must use their visible Tools command.',
      { cause: error },
    );
  }

  const shellFocusTarget = page.locator(IDE_SHELL_SHORTCUT_FOCUS_SELECTOR).first();

  await expect(shellFocusTarget, 'The IDE status bar must expose a focusable shell control').toBeVisible({
    timeout: timeoutMs,
  });
  await expect(shellFocusTarget).toBeEnabled({ timeout: timeoutMs });
  await shellFocusTarget.focus();
  await expect(
    shellFocusTarget,
    'Keyboard focus must leave the Preview iframe and return to the IDE shell',
  ).toBeFocused({
    timeout: timeoutMs,
  });

  await page.keyboard.press('ControlOrMeta+Shift+P');
}

type RuntimeThemeSurface = Frame | Page;

function themeFromClassName(className: string): RuntimeCaptureTheme | undefined {
  const match = className.match(THEME_CLASS_PATTERN);
  const value = match?.slice(1).find(Boolean)?.toLocaleLowerCase();

  return value === 'light' || value === 'dark' ? value : undefined;
}

export function explicitRuntimeTheme(snapshot: Pick<RuntimeThemeSnapshot, 'dataTheme' | 'rootClasses'>) {
  const dataTheme = snapshot.dataTheme?.trim().toLocaleLowerCase();

  if (dataTheme === 'light' || dataTheme === 'dark') {
    return dataTheme;
  }

  const classThemes = new Set(snapshot.rootClasses.map(themeFromClassName).filter(Boolean));

  return classThemes.size === 1 ? ([...classThemes][0] as RuntimeCaptureTheme) : undefined;
}

async function runtimeThemeSnapshot(surface: RuntimeThemeSurface): Promise<RuntimeThemeSnapshot> {
  return surface.evaluate(`(() => {
    const isVisible = (element) => {
      const bounds = element.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        bounds.right <= 0 ||
        bounds.bottom <= 0 ||
        bounds.left >= viewportWidth ||
        bounds.top >= viewportHeight
      ) {
        return false;
      }

      for (let current = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current);

        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) <= 0 ||
          style.contentVisibility === 'hidden'
        ) {
          return false;
        }
      }

      if (
        typeof element.checkVisibility === 'function' &&
        !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        return false;
      }

      const visibleLeft = Math.max(0, bounds.left);
      const visibleTop = Math.max(0, bounds.top);
      const visibleRight = Math.min(viewportWidth, bounds.right);
      const visibleBottom = Math.min(viewportHeight, bounds.bottom);
      const topElement = document.elementFromPoint(
        visibleLeft + (visibleRight - visibleLeft) / 2,
        visibleTop + (visibleBottom - visibleTop) / 2,
      );

      return Boolean(topElement && (topElement === element || element.contains(topElement)));
    };

    const themeControls = Array.from(document.querySelectorAll('[data-testid="app-theme-toggle"]')).map((element) => ({
        ariaLabel: element.getAttribute('aria-label'),
        ariaPressed: element.getAttribute('aria-pressed'),
        disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        role: element.getAttribute('role'),
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || '').replace(/\\s+/g, ' ').trim(),
        title: element.getAttribute('title'),
        type: element.getAttribute('type'),
        visible: isVisible(element),
      }));

    return {
      computedColorScheme: window.getComputedStyle(document.documentElement).colorScheme,
      dataTheme: document.documentElement.getAttribute('data-theme'),
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      prefersLight: window.matchMedia('(prefers-color-scheme: light)').matches,
      rootClasses: Array.from(document.documentElement.classList),
      themeControls,
    };
  })()`);
}

function firstVisibleThemeControl(surface: RuntimeThemeSurface, snapshot: RuntimeThemeSnapshot): Locator | undefined {
  const visibleIndex = snapshot.themeControls.findIndex((candidate) => candidate.visible);

  return visibleIndex >= 0 ? surface.getByTestId('app-theme-toggle').nth(visibleIndex) : undefined;
}

function expectedThemeControlPressed(theme: RuntimeCaptureTheme) {
  return theme === 'dark' ? 'true' : 'false';
}

function formatExpectedThemeControlLabels(theme: RuntimeCaptureTheme) {
  return (Object.keys(THEME_CONTROL_LABELS) as RuntimeThemeLocale[])
    .map((locale) => `${locale.toUpperCase()} ${JSON.stringify(THEME_CONTROL_LABELS[locale][theme])}`)
    .join(' or ');
}

function assertRuntimeThemeControlContract(
  snapshot: RuntimeThemeSnapshot,
  theme: RuntimeCaptureTheme,
  expectedLocale?: RuntimeThemeLocale,
) {
  const visibleControls = snapshot.themeControls.filter((control) => control.visible);

  if (visibleControls.length !== 1) {
    throw new Error(
      `Generated theme control contract violation for ${theme}: expected exactly one visible ` +
        `[data-testid="app-theme-toggle"], found ${visibleControls.length}. ` +
        `Controls: ${JSON.stringify(snapshot.themeControls)}`,
    );
  }

  const control = visibleControls[0];

  const localeFromText = (Object.keys(THEME_CONTROL_LABELS) as RuntimeThemeLocale[]).find(
    (locale) => control.text === THEME_CONTROL_LABELS[locale][theme],
  );

  const locale = expectedLocale ?? localeFromText;
  const violations: string[] = [];

  if (control.tag !== 'button') {
    violations.push(`element must be a button, received ${JSON.stringify(control.tag)}`);
  }

  if (control.type !== 'button') {
    violations.push(`type must equal exactly "button", received ${JSON.stringify(control.type)}`);
  }

  if (control.disabled) {
    violations.push('control must be enabled');
  }

  if (!localeFromText) {
    violations.push(
      `visible text must equal exactly ${formatExpectedThemeControlLabels(theme)}, received ${JSON.stringify(control.text)}`,
    );
  } else if (expectedLocale && localeFromText !== expectedLocale) {
    violations.push(
      `visible text must remain ${expectedLocale.toUpperCase()} after the theme switch, received ${localeFromText.toUpperCase()}`,
    );
  }

  if (locale) {
    const label = THEME_CONTROL_LABELS[locale][theme];

    if (control.ariaLabel !== label) {
      violations.push(
        `aria-label must equal exactly ${JSON.stringify(label)}, received ${JSON.stringify(control.ariaLabel)}`,
      );
    }

    if (control.title !== label) {
      violations.push(`title must equal exactly ${JSON.stringify(label)}, received ${JSON.stringify(control.title)}`);
    }
  } else {
    const labels = formatExpectedThemeControlLabels(theme);

    if (!Object.values(THEME_CONTROL_LABELS).some((byTheme) => byTheme[theme] === control.ariaLabel)) {
      violations.push(`aria-label must equal exactly ${labels}, received ${JSON.stringify(control.ariaLabel)}`);
    }

    if (!Object.values(THEME_CONTROL_LABELS).some((byTheme) => byTheme[theme] === control.title)) {
      violations.push(`title must equal exactly ${labels}, received ${JSON.stringify(control.title)}`);
    }
  }

  const expectedPressed = expectedThemeControlPressed(theme);

  if (control.ariaPressed !== expectedPressed) {
    violations.push(
      `aria-pressed must equal ${JSON.stringify(expectedPressed)} while ${theme} theme is active, ` +
        `received ${JSON.stringify(control.ariaPressed)}`,
    );
  }

  if (violations.length > 0) {
    throw new Error(
      `Generated theme control contract violation for ${theme}: ${violations.join('; ')}. ` +
        `Control: ${JSON.stringify(control)}`,
    );
  }

  if (!localeFromText) {
    throw new Error(`Generated theme control contract violation for ${theme}: locale could not be established.`);
  }

  return { control, locale: localeFromText };
}

function runtimeThemePage(surface: RuntimeThemeSurface): Page {
  return typeof (surface as Page).emulateMedia === 'function' ? (surface as Page) : (surface as Frame).page();
}

async function runtimeThemeControlLabel(control: Locator) {
  return control.evaluate((element) => {
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const text = element.textContent?.replace(/\s+/g, ' ').trim();
    const title = element.getAttribute('title')?.trim();

    return ariaLabel || text || title || element.tagName.toLocaleLowerCase();
  });
}

export async function applyOfficialRuntimeCaptureTheme(
  surface: RuntimeThemeSurface,
  theme: RuntimeCaptureTheme,
  {
    expectedLocale,
    requireVisibleControl = false,
    timeoutMs = 30_000,
  }: { expectedLocale?: RuntimeThemeLocale; requireVisibleControl?: boolean; timeoutMs?: number } = {},
) {
  /*
   * Keep the browser-level signal for generated apps that follow
   * prefers-color-scheme. Explicit app-owned theme state must instead be
   * exercised through the same visible control a user clicks.
   */
  const page = runtimeThemePage(surface);

  await page.emulateMedia({ colorScheme: theme });
  await surface.evaluate(`document.fonts && document.fonts.ready`);

  const before = await runtimeThemeSnapshot(surface);
  const activeTheme = explicitRuntimeTheme(before);
  const control = firstVisibleThemeControl(surface, before);

  if (!activeTheme) {
    if (requireVisibleControl && before.themeControls.filter((candidate) => candidate.visible).length !== 1) {
      assertRuntimeThemeControlContract(before, theme, expectedLocale);
    }

    if (requireVisibleControl) {
      throw new Error(
        `The generated application theme is not explicit after emulating ${theme}; expected html[data-theme] or a supported root theme class. ` +
          `Diagnostics: ${JSON.stringify(before)}`,
      );
    }

    return { activeTheme: theme, strategy: 'prefers-color-scheme' as const };
  }

  const beforeControlContract =
    requireVisibleControl || before.themeControls.some((candidate) => candidate.visible)
      ? assertRuntimeThemeControlContract(before, activeTheme, expectedLocale)
      : undefined;

  if (activeTheme === theme) {
    return { activeTheme: theme, strategy: 'explicit-state-already-applied' as const };
  }

  if (!control) {
    throw new Error(
      `The official runtime declares the explicit ${activeTheme} theme but exposes no visible EN/FR theme control for ${theme}. ` +
        `Diagnostics: ${JSON.stringify(before)}`,
    );
  }

  const controlLabel = await runtimeThemeControlLabel(control);

  await control.click();

  try {
    await expect
      .poll(async () => explicitRuntimeTheme(await runtimeThemeSnapshot(surface)), {
        message: `The official runtime theme control must switch from ${activeTheme} to ${theme}`,
        intervals: [100, 250, 500],
        timeout: timeoutMs,
      })
      .toBe(theme);
  } catch (error) {
    const after = await runtimeThemeSnapshot(surface).catch((diagnosticError) => ({
      diagnosticError: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
      url: page.url(),
    }));

    throw new Error(
      `The visible official runtime theme control ${JSON.stringify(controlLabel)} did not reach ${theme}. ` +
        `Before: ${JSON.stringify(before)}. After: ${JSON.stringify(after)}`,
      { cause: error },
    );
  }

  await surface.evaluate(`document.fonts && document.fonts.ready`);

  const after = await runtimeThemeSnapshot(surface);

  assertRuntimeThemeControlContract(after, theme, expectedLocale ?? beforeControlContract?.locale);

  return { activeTheme: theme, strategy: 'visible-runtime-control' as const };
}
