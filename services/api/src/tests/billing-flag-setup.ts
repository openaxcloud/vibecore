/*
 * KILL-SWITCH FACTURATION — la suite existante continue de tester le chemin PAYANT.
 *
 * Le kill-switch est fail-closed : sans variable, la facturation est éteinte.
 * Sans ce fichier, les ~47 tests qui prouvent l'encaissement (checkout, webhooks
 * Stripe, débits de crédits, métrage) tomberaient — non parce qu'ils régressent,
 * mais parce que la caisse est fermée. On perdrait alors la garantie qui compte
 * pour la RÉVERSIBILITÉ : que rallumer le drapeau restaure une facturation
 * fonctionnelle.
 *
 * La suite tourne donc drapeau ARMÉ (billing ON), et les specs du kill-switch
 * construisent explicitement leur propre environnement à OFF.
 */
process.env.BILLING_ENABLED = 'true';

if (typeof globalThis.process?.env === 'object') {
  globalThis.process.env.BILLING_ENABLED = 'true';
}
