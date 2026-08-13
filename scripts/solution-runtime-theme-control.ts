import { expect, type Frame, type Locator, type Page } from '@playwright/test';

export type RuntimeCaptureTheme = 'light' | 'dark';

type RuntimeThemeSnapshot = {
  computedColorScheme: string;
  dataTheme: string | null;
  prefersDark: boolean;
  prefersLight: boolean;
  rootClasses: string[];
  visibleThemeControls: Array<{
    ariaLabel: string | null;
    role: string | null;
    tag: string;
    text: string;
    title: string | null;
  }>;
};

const THEME_CLASS_PATTERN = /^(?:(dark|light)|(?:theme|mode)[-_](dark|light)|(dark|light)[-_](?:theme|mode))$/i;

const THEME_CONTROL_LABEL_PARTS = [
  String.raw`(?:toggle|switch|change)(?:\s+the)?(?:\s+colou?r)?\s+(?:theme|mode)`,
  String.raw`(?:switch|change)\s+to\s+(?:light|dark)(?:\s+(?:theme|mode))?`,
  String.raw`(?:light|dark)\s+(?:theme|mode)`,
  String.raw`(?:changer|basculer)\s+(?:(?:de|le)\s+)?(?:th[eè]me|mode)`,
  String.raw`(?:activer|passer\s+(?:au|en))\s+(?:le\s+)?mode\s+(?:clair|sombre)`,
  String.raw`mode\s+(?:clair|sombre)`,
  String.raw`(?:th[eè]me|theme)\s+(?:clair|sombre)`,
] as const;

export const OFFICIAL_RUNTIME_THEME_CONTROL_LABEL = new RegExp(`^(?:${THEME_CONTROL_LABEL_PARTS.join('|')})$`, 'iu');

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
      const style = window.getComputedStyle(element);

      return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const visibleThemeControls = Array.from(
      document.querySelectorAll('button, [role="button"], [role="switch"], [role="checkbox"]'),
    )
      .filter(isVisible)
      .map((element) => ({
        ariaLabel: element.getAttribute('aria-label'),
        role: element.getAttribute('role'),
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        title: element.getAttribute('title'),
      }))
      .filter((control) => /theme|mode|th[eè]me|clair|sombre|light|dark/i.test(
        [control.ariaLabel, control.text, control.title].filter(Boolean).join(' '),
      ))
      .slice(0, 12);

    return {
      computedColorScheme: window.getComputedStyle(document.documentElement).colorScheme,
      dataTheme: document.documentElement.getAttribute('data-theme'),
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      prefersLight: window.matchMedia('(prefers-color-scheme: light)').matches,
      rootClasses: Array.from(document.documentElement.classList),
      visibleThemeControls,
    };
  })()`);
}

async function firstVisibleThemeControl(surface: RuntimeThemeSurface): Promise<Locator | undefined> {
  const candidates = [
    surface.getByTestId('app-theme-toggle'),
    surface.getByRole('button', { name: OFFICIAL_RUNTIME_THEME_CONTROL_LABEL }),
    surface.getByRole('switch', { name: OFFICIAL_RUNTIME_THEME_CONTROL_LABEL }),
    surface.getByRole('checkbox', { name: OFFICIAL_RUNTIME_THEME_CONTROL_LABEL }),
  ];

  for (const candidatesForRole of candidates) {
    const count = await candidatesForRole.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = candidatesForRole.nth(index);

      if ((await candidate.isVisible()) && (await candidate.isEnabled())) {
        return candidate;
      }
    }
  }

  return undefined;
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
  { requireVisibleControl = false, timeoutMs = 30_000 }: { requireVisibleControl?: boolean; timeoutMs?: number } = {},
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
  const control = await firstVisibleThemeControl(surface);

  if (requireVisibleControl && !control) {
    throw new Error(
      `The generated application exposes no visible data-testid=app-theme-toggle or EN/FR theme control for ${theme}. ` +
        `Diagnostics: ${JSON.stringify(before)}`,
    );
  }

  if (!activeTheme) {
    if (requireVisibleControl) {
      throw new Error(
        `The generated application theme is not explicit after emulating ${theme}; expected html[data-theme] or a supported root theme class. ` +
          `Diagnostics: ${JSON.stringify(before)}`,
      );
    }

    return { activeTheme: theme, strategy: 'prefers-color-scheme' as const };
  }

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

  return { activeTheme: theme, strategy: 'visible-runtime-control' as const };
}
