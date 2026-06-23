import { bootstrapMobileApp, type MobileBootstrapOptions } from './native';

export type BootstrapRunner = (options: MobileBootstrapOptions) => Promise<unknown>;

/**
 * Launch the mobile bootstrap without ever leaking an unhandled rejection.
 *
 * `bootstrapMobileApp` awaits several optional native capabilities in sequence
 * (deep links, push permission/registration, status bar). On iOS a denied or
 * restricted push permission — or any plugin error — rejects one of those
 * awaits. Firing the bootstrap with a bare `void` would turn that into an
 * unhandled promise rejection (and, in dev, a noisy crash). We funnel the
 * failure into the same crash-report hook the rest of the app uses so the
 * shell keeps running in a degraded-but-usable state instead of aborting.
 */
export function launchMobileBootstrap(
  options: MobileBootstrapOptions = {},
  run: BootstrapRunner = bootstrapMobileApp,
): Promise<void> {
  return Promise.resolve()
    .then(() => run(options))
    .then(() => undefined)
    .catch((error: unknown) => {
      options.onCrashReport?.(error, { source: 'bootstrap-launch' });
    });
}
