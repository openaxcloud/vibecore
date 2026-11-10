/** Test-only, fixed-label diagnostics. Never retain DOM text, values, IDs or URLs. */
export const SECRETS_LIFECYCLE_LIMIT = 96;

const EVENTS = ['initial', 'lifecycle', 'pointerdown', 'mousedown', 'click', 'scroll', 'resize', 'limit'];
const TARGETS = ['none', 'new-secret', 'menu-trigger', 'menuitem', 'inside', 'outside'];

export function createSecretsLifecycleEvidence(now = Date.now) {
  const started = now();
  const events = [];

  let omitted = 0;
  let stopped = false;
  let installed = false;

  return {
    capture(value) {
      if (stopped || !value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }

      // Read only own data properties, not page-supplied getters or extra fields.
      const read = (key) => Object.getOwnPropertyDescriptor(value, key)?.value;
      const event = read('event');
      const target = read('target');
      const flags = ['panel', 'menu', 'form', 'panelReplaced', 'trusted'];

      if (!EVENTS.includes(event) || !TARGETS.includes(target) || flags.some((key) => typeof read(key) !== 'boolean')) {
        return;
      }

      if (events.length >= SECRETS_LIFECYCLE_LIMIT) {
        omitted = Math.min(omitted + 1, 1000000);
        return;
      }

      events.push({
        event,
        target,
        ...Object.fromEntries(flags.map((key) => [key, read(key)])),
        elapsedMs: Math.max(0, Math.round(now() - started)),
      });
    },
    installed() {
      installed = true;
    },
    stop() {
      stopped = true;
    },
    snapshot() {
      return { installed, events: events.map((event) => ({ ...event })), omitted };
    },
  };
}

/** Serialized by Playwright: keep dependencies inside this function. */
export function installSecretsLifecycleProbe() {
  if (window !== window.top || window.__secretsLifecycleProbe) {
    return;
  }

  const panelSelector = '[data-testid="secrets-panel"]';
  const menuSelector = '[data-testid="secrets-floating-menu"]';
  const formSelector = '[data-testid="secrets-form"]';

  let panels = [];
  let menus = [];
  let forms = [];
  let emitted = 0;
  let stopped = false;

  const same = (a, b) => a.length === b.length && a.every((node, index) => node === b[index]);

  const send = (event, target = 'none', trusted = false, panelReplaced = false) => {
    if (stopped) {
      return;
    }

    const record = {
      event,
      target,
      trusted,
      panelReplaced,
      panel: panels.length > 0,
      menu: menus.length > 0,
      form: forms.length > 0,
    };

    // Bound browser work/transport too, including across noisy mutation/scroll streams.
    if (emitted++ >= 96) {
      record.event = 'limit';
      stop();
    }

    try {
      Promise.resolve(window.__recordSecretsLifecycle(record)).catch(() => {});
    } catch {
      /* Observer only. */
    }
  };
  const sample = (initial = false) => {
    if (stopped) {
      return;
    }

    const nextPanels = [...document.querySelectorAll(panelSelector)];
    const nextMenus = [...document.querySelectorAll(menuSelector)];
    const nextForms = [...document.querySelectorAll(formSelector)];
    const changed = !same(panels, nextPanels) || !same(menus, nextMenus) || !same(forms, nextForms);
    const replaced = panels.length > 0 && nextPanels.length > 0 && !same(panels, nextPanels);
    panels = nextPanels;
    menus = nextMenus;
    forms = nextForms;

    if (initial || changed) {
      send(initial ? 'initial' : 'lifecycle', 'none', false, replaced);
    }
  };
  const onEvent = (event) => {
    sample();

    if (stopped || (!panels.length && !menus.length)) {
      return;
    }

    const element = event.target instanceof Element ? event.target : null;

    let target = 'outside';

    if (element?.closest('[data-testid="secrets-new"]')) {
      target = 'new-secret';
    } else if (element?.closest('[data-testid^="secret-menu-"]') || element?.closest('[data-testid="secrets-menu"]')) {
      target = 'menu-trigger';
    } else if (element?.closest(`${menuSelector} [role="menuitem"]`)) {
      target = 'menuitem';
    } else if (element?.closest(panelSelector) || element?.closest(menuSelector)) {
      target = 'inside';
    }

    send(event.type, target, event.isTrusted);
  };

  const observer = new MutationObserver(() => sample());
  const types = ['pointerdown', 'mousedown', 'click', 'scroll', 'resize'];

  function stop() {
    stopped = true;
    observer.disconnect();

    for (const type of types) {
      window.removeEventListener(type, onEvent, true);
    }
  }
  window.__secretsLifecycleProbe = { stop };
  observer.observe(document, { childList: true, subtree: true });

  for (const type of types) {
    window.addEventListener(type, onEvent, true);
  }
  sample(true);
}

/** Streams evidence during actions; never relies on an end-of-test browser evaluation. */
export async function attachSecretsLifecycleEvidence(page, evidence = createSecretsLifecycleEvidence()) {
  try {
    await page.exposeBinding('__recordSecretsLifecycle', (source, value) => {
      if (source.frame === page.mainFrame()) {
        evidence.capture(value);
      }
    });
    await page.addInitScript(installSecretsLifecycleProbe);
    evidence.installed();
  } catch {
    /* Diagnostics must not replace the test result. */
  }
  return {
    snapshot: evidence.snapshot,
    stop() {
      evidence.stop();

      // Do not wait inside the action budget. Closing the page also disposes observers.
      void page.evaluate(() => window.__secretsLifecycleProbe?.stop()).catch(() => {});
    },
  };
}
