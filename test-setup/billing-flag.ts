/*
 * KILL-SWITCH FACTURATION — la suite front continue de tester le chemin PAYANT.
 *
 * Même raison que côté API : le kill-switch est fail-closed, donc sans variable
 * les pages de facturation répondent 404 et toutes les specs qui les couvrent
 * tomberaient — non par régression, mais parce que la caisse est fermée. On
 * perdrait la garantie qui compte pour la RÉVERSIBILITÉ : que rallumer le
 * drapeau restaure des surfaces fonctionnelles.
 *
 * La suite tourne donc drapeau ARMÉ ; les specs du kill-switch posent
 * explicitement leur propre environnement à OFF.
 */
process.env.BILLING_ENABLED = 'true';

if (typeof globalThis.process?.env === 'object') {
  globalThis.process.env.BILLING_ENABLED = 'true';
}
