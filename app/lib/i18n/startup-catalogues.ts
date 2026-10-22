/** Keep the server-rendered document intact until its translations are available. */
export function startCatalogueHydration(load: () => Promise<void>, hydrate: () => void): void {
  const recovery = document.querySelector<HTMLElement>('[data-ecode-startup-recovery]');
  const retry = recovery?.querySelector<HTMLButtonElement>('button');

  let inFlight = false;
  let started = false;

  const attempt = async () => {
    if (inFlight || started) {
      return;
    }

    inFlight = true;

    if (recovery) {
      recovery.hidden = true;
    }

    try {
      await load();

      // Restore the exact SSR attributes before React takes ownership.
      retry?.removeEventListener('click', onRetry);
      hydrate();
      started = true;
    } catch (error) {
      console.error('i18n startup failed; hydration paused until retry', error);

      if (recovery) {
        recovery.hidden = false;
        retry?.focus();
      }
    } finally {
      inFlight = false;
    }
  };

  function onRetry(event: Event) {
    event.preventDefault();
    void attempt();
  }

  retry?.addEventListener('click', onRetry);
  void attempt();
}
