/**
 * Arabic translation bundle. Mirrors the English keys exactly; any
 * untranslated key falls back to the English seed via `t()`. Arabic is a
 * right-to-left language — see `app/lib/i18n/direction.ts`, which drives the
 * `dir="rtl"` layout on the agent/chat surfaces when this language is active.
 */

import type { TranslationBundle } from '~/lib/i18n/dictionary';

export const ar: TranslationBundle = {
  // Patch review panel
  'patchReview.title': 'الملفات المعدّلة',
  'patchReview.filesCount': '{count} ملفات',
  'patchReview.aggregateAriaLabel': 'أُضيف {added}، حُذف {removed} عبر {files} ملفات',
  'patchReview.applyAll': 'تطبيق الكل ({count})',
  'patchReview.applying': 'جارٍ التطبيق…',
  'patchReview.noChanges': 'المحتوى مطابق للملف الموجود على القرص.',
  'patchReview.streaming': 'جارٍ بثّ التغييرات…',

  // File mentions palette
  'mentions.empty': 'لا توجد ملفات مطابقة',

  // Slash commands palette
  'slashCommands.empty': 'لا توجد أوامر مطابقة',

  // Plan checklist
  'plan.progressLabel': '{completed} / {total} مكتمل',
  'plan.progressLabelWithFailed': '{completed} / {total} مكتمل · {failed} فشل',
  'plan.statusPending': 'قيد الانتظار',
  'plan.statusInProgress': 'قيد التنفيذ',
  'plan.statusCompleted': 'تم',
  'plan.statusFailed': 'فشل',

  // Conversation branches dropdown
  'branches.ariaLabel': 'فروع المحادثة ({count})',
  'branches.trigger.title': 'تصفّح فروع المحادثة',
  'branches.row.switch': 'التبديل إلى {label}',
  'branches.row.rename': 'إعادة تسمية {label}',
  'branches.row.delete': 'حذف {label}',
  'branches.row.deleteTitle': 'حذف الفرع (والفروع التابعة)',
  'branches.row.renameTitle': 'إعادة تسمية الفرع',
  'branches.switchedToast': 'تم تبديل المحادثة',
  'branches.switchFailedToast': 'تعذّر التبديل — المحادثة غير موجودة',
  'branches.renamePrompt': 'إعادة تسمية الفرع',
  'branches.emptyTitleToast': 'لا يمكن أن يكون العنوان فارغًا',
  'branches.deleteConfirm': 'حذف هذا الفرع وأي فروع فرعية؟',
  'branches.deletedToast': 'تم حذف الفرع',

  // Share view (read-only landing)
  'share.fallbackTitle': 'محادثة مُشارَكة',
  'share.metaPrefix': 'مُشارَكة من المشروع',
  'share.disclaimer': 'هذه لقطة للقراءة فقط من المحادثة. {count} رسالة{plural} في الحزمة.',
  'share.errorTitle': 'رابط المشاركة غير متاح',
  'share.errorDefault': 'تعذّر فكّ ترميز محتوى الرابط.',
  'share.forkButton': 'تفريع هذه المحادثة (سجّل الدخول للتفعيل)',

  // Presence avatars
  'presence.viewersAriaLabel': '{count} مشاهدين',
  'presence.overflowAriaLabel': '{count} مشاهدين آخرين',
  'presence.statusTyping': 'يكتب',
  'presence.statusViewing': 'يشاهد',
  'presence.statusIdle': 'خامل',

  // Share button
  'shareButton.label': 'مشاركة هذه المحادثة',
  'shareButton.disabled': 'أرسل رسالة واحدة على الأقل قبل المشاركة',
  'shareButton.enabled': 'انسخ رابط مشاركة لهذه المحادثة',
  'shareButton.copiedToast': 'تم نسخ رابط المشاركة إلى الحافظة',
  'shareButton.errorCouldNotBuild': 'تعذّر إنشاء رابط المشاركة',
  'shareButton.errorClipboard': 'تم إنشاء الرابط لكن فشل النسخ إلى الحافظة',
};
