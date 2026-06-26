/**
 * Spanish translation bundle. Mirrors the English keys exactly; any
 * untranslated key falls back to the English seed via `t()`.
 */

import type { TranslationBundle } from '~/lib/i18n/dictionary';

export const es: TranslationBundle = {
  // Patch review panel
  'patchReview.title': 'Archivos modificados',
  'patchReview.filesCount': '{count} archivos',
  'patchReview.aggregateAriaLabel': '{added} añadidas, {removed} eliminadas en {files} archivos',
  'patchReview.applyAll': 'Aplicar todo ({count})',
  'patchReview.applying': 'Aplicando…',
  'patchReview.noChanges': 'El contenido es idéntico al archivo en disco.',
  'patchReview.streaming': 'Transmitiendo cambios…',

  // File mentions palette
  'mentions.empty': 'No hay archivos coincidentes',

  // Slash commands palette
  'slashCommands.empty': 'No hay comandos coincidentes',

  // Plan checklist
  'plan.progressLabel': '{completed} / {total} completado',
  'plan.progressLabelWithFailed': '{completed} / {total} completado · {failed} con error',
  'plan.statusPending': 'Pendiente',
  'plan.statusInProgress': 'En curso',
  'plan.statusCompleted': 'Hecho',
  'plan.statusFailed': 'Con error',

  // Conversation branches dropdown
  'branches.ariaLabel': 'Ramas de la conversación ({count})',
  'branches.trigger.title': 'Explorar ramas de la conversación',
  'branches.row.switch': 'Cambiar a {label}',
  'branches.row.rename': 'Renombrar {label}',
  'branches.row.delete': 'Eliminar {label}',
  'branches.row.deleteTitle': 'Eliminar rama (y descendientes)',
  'branches.row.renameTitle': 'Renombrar rama',
  'branches.switchedToast': 'Conversación cambiada',
  'branches.switchFailedToast': 'No se pudo cambiar — falta la conversación',
  'branches.renamePrompt': 'Renombrar rama',
  'branches.emptyTitleToast': 'El título no puede estar vacío',
  'branches.deleteConfirm': '¿Eliminar esta rama y sus subramas?',
  'branches.deletedToast': 'Rama eliminada',

  // Share view (read-only landing)
  'share.fallbackTitle': 'Conversación compartida',
  'share.metaPrefix': 'Compartido desde el proyecto',
  'share.disclaimer':
    'Esta es una instantánea de solo lectura de la conversación. {count} mensaje{plural} en el paquete.',
  'share.errorTitle': 'Enlace para compartir no disponible',
  'share.errorDefault': 'No se pudo decodificar el contenido del enlace.',
  'share.forkButton': 'Bifurcar esta conversación (inicia sesión para habilitar)',

  // Presence avatars
  'presence.viewersAriaLabel': '{count} espectadores',
  'presence.overflowAriaLabel': '{count} espectadores más',
  'presence.statusTyping': 'escribiendo',
  'presence.statusViewing': 'viendo',
  'presence.statusIdle': 'inactivo',

  // Share button
  'shareButton.label': 'Compartir esta conversación',
  'shareButton.disabled': 'Envía al menos un mensaje antes de compartir',
  'shareButton.enabled': 'Copiar un enlace para compartir esta conversación',
  'shareButton.copiedToast': 'Enlace para compartir copiado al portapapeles',
  'shareButton.errorCouldNotBuild': 'No se pudo crear el enlace para compartir',
  'shareButton.errorClipboard': 'Se creó el enlace pero falló la copia al portapapeles',
};
