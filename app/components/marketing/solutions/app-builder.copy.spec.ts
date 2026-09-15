import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_BUILDER_COPY } from './app-builder.copy';
import { APP_BUILDER_VISUAL_ASSETS } from './app-builder.visuals';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '~/lib/i18n/language';

const EXPECTED_FRENCH_PROMPT =
  'Crée une application de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email.';

const BANNED_SPEC_LANGUAGE = /\b(?:should be|can be|is designed to)\b/i;

const BANNED_UNVERIFIED_CLAIMS =
  /(?:trusted by|built for fortune 500|99[.,]99\s*%|4[ ,.]*500\+|10[ ,.]*000|18 global regions|soc\s*2|iso\s*27001|hipaa|customer testimonial|client testimonial)/i;

const LARGE_SOCIAL_PROOF_NUMBER = /\b\d{1,3}(?:[ ,.']\d{3})+\+?\b/;

const PERCENTAGE_CLAIM = /\b\d+(?:[.,]\d+)?\s*%/;

const BANNED_ONE_CLICK_CLAIM = /(?:one[- ]click|with one click|en un clic|con un clic|بنقرة واحدة)/i;

const BANNED_CATEGORICAL_SECURITY = /(?:secure access|accès sécurisés?|acceso seguro|وصول آمن)/i;

const BANNED_DEMO_STATUS_CLAIMS =
  /(?:generated|connected|ready|généré|relié|prêt|generad[oa]|conectad[oa]|list[oa]|تم إنشاء|تم ربط|جاهز)/i;

const OPEN_FULL_SIZE_LABELS = {
  en: 'Open full-size IDE capture',
  fr: 'Ouvrir la capture IDE en taille réelle',
  es: 'Abrir la captura del IDE a tamaño completo',
  ar: 'افتح لقطة بيئة التطوير بالحجم الكامل',
} as const satisfies Record<SupportedLanguage, string>;

const PROOF_DISCLOSURE_PATTERNS = {
  en: [
    /E-Code UI/i,
    /generated (?:project )?files/i,
    /running Preview/i,
    /fictional/i,
    /local in-memory adapter/i,
    /no external database/i,
    /authentication provider/i,
    /email delivery service/i,
  ],
  fr: [
    /interface E-Code/i,
    /fichiers générés/i,
    /aperçu actif/i,
    /fictives/i,
    /adaptateur local en mémoire/i,
    /aucune base externe/i,
    /fournisseur d’authentification/i,
    /service d’envoi d’emails/i,
  ],
  es: [
    /interfaz de E-Code/i,
    /archivos generados/i,
    /vista previa en ejecución/i,
    /ficticios/i,
    /adaptador local en memoria/i,
    /base de datos externa/i,
    /proveedor de autenticación/i,
    /servicio de envío de emails/i,
  ],
  ar: [
    /واجهة E-Code/i,
    /ملفات المشروع المُنشأة/i,
    /المعاينة العاملة/i,
    /خيالية/i,
    /محوّل بيانات محليًا في الذاكرة/i,
    /قاعدة بيانات خارجية/i,
    /مزوّد مصادقة/i,
    /خدمة إرسال بريد إلكتروني/i,
  ],
} as const satisfies Record<SupportedLanguage, readonly RegExp[]>;

const PROOF_DISCLAIMER_PATTERNS = {
  en: [
    /E-Code UI/i,
    /generated files/i,
    /running Preview/i,
    /fictional/i,
    /local in-memory adapter/i,
    /no external database/i,
    /authentication provider/i,
    /email delivery service/i,
  ],
  fr: [
    /interface E-Code/i,
    /fichiers générés/i,
    /aperçu actif/i,
    /fictives/i,
    /adaptateur local en mémoire/i,
    /aucune base externe/i,
    /authentification/i,
    /service d’envoi d’emails/i,
  ],
  es: [
    /interfaz de E-Code/i,
    /archivos generados/i,
    /Preview en ejecución/i,
    /ficticios/i,
    /adaptador local en memoria/i,
    /sin base externa/i,
    /proveedor de autenticación/i,
    /servicio de envío de emails/i,
  ],
  ar: [
    /واجهة E-Code/i,
    /الملفات المُنشأة/i,
    /المعاينة العاملة/i,
    /خيالية/i,
    /محوّل محلي في الذاكرة/i,
    /بلا قاعدة خارجية/i,
    /مصادقة/i,
    /خدمة بريد/i,
  ],
} as const satisfies Record<SupportedLanguage, readonly RegExp[]>;

const NOT_A_GENERATION_RECORD_PATTERNS = {
  en: /not (?:a generation record|a record of an E-Code generation)/i,
  fr: /pas (?:(?:une )?trace de|la trace d’une) génération/i,
  es: /no (?:es un|el) registro de (?:una )?generación/i,
  ar: /ليس سجلًا لعملية إنشاء/i,
} as const satisfies Record<SupportedLanguage, RegExp>;

const SCRIPTED_DEMO_PATTERNS = {
  en: /scripted/i,
  fr: /scénarisée/i,
  es: /guionizada/i,
  ar: /بسيناريو مُعدّ مسبقًا/i,
} as const satisfies Record<SupportedLanguage, RegExp>;

const NOT_BACKEND_PROOF_PATTERNS = {
  en: /does not demonstrate server logic/i,
  fr: /ne démontre ni logique serveur/i,
  es: /no demuestra lógica de servidor/i,
  ar: /لا تثبت منطق خادم/i,
} as const satisfies Record<SupportedLanguage, RegExp>;

const NOT_CONNECTED_PROOF_PATTERNS = {
  en: [/external database/i, /authentication provider/i, /email delivery service/i],
  fr: [/base externe/i, /fournisseur d’authentification/i, /service d’envoi d’emails/i],
  es: [/base externa/i, /proveedor de autenticación/i, /servicio de envío de emails/i],
  ar: [/قاعدة خارجية/i, /مزوّد مصادقة/i, /خدمة إرسال بريد/i],
} as const satisfies Record<SupportedLanguage, readonly RegExp[]>;

const STATIC_PUBLISHING_PATTERNS = {
  en: /supported static builds/i,
  fr: /compilations statiques prises en charge/i,
  es: /builds estáticos compatibles/i,
  ar: /الإصدارات الثابتة المدعومة/i,
} as const satisfies Record<SupportedLanguage, RegExp>;

const SERVER_EXPORT_PATTERNS = {
  en: /server-backed projects remain exportable/i,
  fr: /projets avec serveur restent exportables/i,
  es: /proyectos con servidor siguen siendo exportables/i,
  ar: /المشاريع التي تتضمن خادمًا قابلة للتصدير/i,
} as const satisfies Record<SupportedLanguage, RegExp>;

const BANNED_UNVERIFIED_FEATURES =
  /(?:Authentication, roles|Integrations and notifications|Authentification, rôles|Intégrations et notifications|Autenticación, roles|Integraciones y notificaciones|مصادقة وأدوار|تكاملات وإشعارات)/i;

const APP_BUILDER_VISUALS = Object.values(APP_BUILDER_VISUAL_ASSETS).flatMap((assets) => Object.values(assets));

type Copy = (typeof APP_BUILDER_COPY)[SupportedLanguage];

function collectStringLeaves(value: unknown, path = ''): Map<string, string> {
  const leaves = new Map<string, string>();

  if (typeof value === 'string') {
    leaves.set(path, value);

    return leaves;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [childPath, childValue] of collectStringLeaves(item, `${path}.${index}`)) {
        leaves.set(childPath, childValue);
      }
    });

    return leaves;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;

      for (const [leafPath, leafValue] of collectStringLeaves(child, childPath)) {
        leaves.set(leafPath, leafValue);
      }
    });
  }

  return leaves;
}

function expectLength(value: string, minimum: number, maximum: number, label: string) {
  expect(value.length, `${label} is shorter than ${minimum} characters`).toBeGreaterThanOrEqual(minimum);
  expect(value.length, `${label} is longer than ${maximum} characters`).toBeLessThanOrEqual(maximum);
}

function expectContentItems(
  items: readonly Readonly<{ title: string; body: string }>[],
  expectedCount: number,
  label: string,
) {
  expect(items, `${label} count`).toHaveLength(expectedCount);

  for (const [index, item] of items.entries()) {
    expectLength(item.title, 8, 120, `${label}.${index}.title`);
    expectLength(item.body, 70, 500, `${label}.${index}.body`);
  }
}

function expectCompleteCopy(copy: Copy, language: SupportedLanguage) {
  expectLength(copy.seo.title, 20, 60, `${language}.seo.title`);
  expectLength(copy.seo.description, 100, 220, `${language}.seo.description`);
  expect(copy.seo.title).toContain('E-Code');
  expect(copy.seo.description).toContain('E-Code');

  expectLength(copy.hero.eyebrow, 8, 80, `${language}.hero.eyebrow`);
  expectLength(copy.hero.title, 24, 100, `${language}.hero.title`);
  expectLength(copy.hero.subtitle, 140, 380, `${language}.hero.subtitle`);
  expectLength(copy.hero.microcopy, 70, 300, `${language}.hero.microcopy`);
  expectLength(copy.prompt.text, 60, 180, `${language}.prompt.text`);

  for (const [label, action] of [
    ['hero.primaryCta', copy.hero.primaryCta],
    ['hero.secondaryCta', copy.hero.secondaryCta],
    ['finalCta.primaryCta', copy.finalCta.primaryCta],
    ['finalCta.secondaryCta', copy.finalCta.secondaryCta],
  ] as const) {
    expectLength(action.label, 3, 50, `${language}.${label}.label`);
    expectLength(action.ariaLabel, 12, 120, `${language}.${label}.ariaLabel`);
    expect(action.ariaLabel, `${language}.${label} needs a descriptive accessible name`).not.toBe(action.label);
  }

  expect(copy.hero.primaryCta.label).toBe(copy.finalCta.primaryCta.label);
  expectContentItems(copy.problem.obstacles, 3, `${language}.problem.obstacles`);
  expectContentItems(copy.prompt.outputs, 4, `${language}.prompt.outputs`);
  expectContentItems(copy.proof.steps, 3, `${language}.proof.steps`);
  expectContentItems([copy.proof.preview, copy.proof.iteration], 2, `${language}.proof.visuals`);
  expectContentItems(copy.visuals.items, 3, `${language}.visuals.items`);
  expectContentItems([copy.visuals.system], 1, `${language}.visuals.system`);
  expectContentItems(copy.deliverables.items, 6, `${language}.deliverables.items`);
  expectContentItems(copy.features.items, 6, `${language}.features.items`);
  expectContentItems(copy.useCases.items, 4, `${language}.useCases.items`);

  expect(copy.prompt.demoLabels.calendar.slots).toHaveLength(3);
  expect(copy.prompt.demoLabels.database.tables).toHaveLength(3);
  expect(copy.prompt.demoLabels.statuses.items).toHaveLength(4);
  expectLength(copy.visuals.galleryLabel, 20, 140, `${language}.visuals.galleryLabel`);
  expectLength(copy.visuals.disclaimer, 20, 160, `${language}.visuals.disclaimer`);
  expectLength(copy.proof.disclaimer, 20, 280, `${language}.proof.disclaimer`);
  expectLength(copy.proof.openFullSizeLabel, 12, 100, `${language}.proof.openFullSizeLabel`);
  expect(copy.proof.openFullSizeLabel).toBe(OPEN_FULL_SIZE_LABELS[language]);

  for (const [index, visual] of [
    ...copy.visuals.items,
    copy.visuals.system,
    copy.proof.preview,
    copy.proof.iteration,
  ].entries()) {
    expectLength(visual.alt, 40, 220, `${language}.visuals.${index}.alt`);
    expect(visual.alt, `${language}.visuals.${index}.alt must not repeat the visible title`).not.toBe(visual.title);
  }

  expect(copy.faq.items).toHaveLength(6);

  for (const [index, faq] of copy.faq.items.entries()) {
    expectLength(faq.question, 8, 140, `${language}.faq.items.${index}.question`);
    expectLength(faq.answer, 70, 520, `${language}.faq.items.${index}.answer`);
  }

  const ariaLabels = Object.entries(copy.aria);
  expect(ariaLabels).toHaveLength(13);
  expect(new Set(ariaLabels.map(([, value]) => value)).size, `${language}.aria labels must be specific`).toBe(
    ariaLabels.length,
  );

  for (const [name, value] of ariaLabels) {
    expectLength(value, 12, 120, `${language}.aria.${name}`);
  }
}

describe('App Builder localized sales copy', () => {
  it('ships an exhaustive copy tree for every supported language without implicit fallback', () => {
    expect(Object.keys(APP_BUILDER_COPY)).toEqual([...SUPPORTED_LANGUAGES]);

    const englishLeaves = collectStringLeaves(APP_BUILDER_COPY.en);
    expect(englishLeaves.size).toBeGreaterThan(100);

    for (const language of SUPPORTED_LANGUAGES) {
      const copy = APP_BUILDER_COPY[language];
      const leaves = collectStringLeaves(copy);

      expect([...leaves.keys()], `${language} copy shape`).toEqual([...englishLeaves.keys()]);

      for (const [path, value] of leaves) {
        expect(value, `${language}.${path} must not be blank`).toBe(value.trim());
        expect(value.length, `${language}.${path} must not be blank`).toBeGreaterThan(0);
        expect(value, `${language}.${path} must not expose an interpolation placeholder`).not.toMatch(/\{[^}]+\}/);
      }

      expectCompleteCopy(copy, language);
    }
  });

  it('contains a genuinely localized tree instead of copying the English page into other locales', () => {
    const englishLeaves = collectStringLeaves(APP_BUILDER_COPY.en);

    for (const language of ['fr', 'es', 'ar'] as const) {
      const localizedLeaves = collectStringLeaves(APP_BUILDER_COPY[language]);
      const translatedLeaves = [...localizedLeaves].filter(([path, value]) => englishLeaves.get(path) !== value);

      expect(
        translatedLeaves.length / localizedLeaves.size,
        `${language} must translate at least 95% of string leaves; times and proper nouns may stay identical`,
      ).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('preserves the exact French salon prompt and the requested concrete output contract', () => {
    const copy = APP_BUILDER_COPY.fr;

    expect(copy.prompt.text).toBe(EXPECTED_FRENCH_PROMPT);
    expect(copy.hero.primaryCta.label).toBe('Décrivez votre application');
    expect(copy.prompt.outputs.map(({ title }) => title)).toEqual([
      expect.stringMatching(/écrans.*réservation/i),
      expect.stringMatching(/base.*réservation/i),
      expect.stringMatching(/règles.*réservation/i),
      expect.stringMatching(/aperçu.*déploiement/i),
    ]);
    expect(copy.deliverables.items.map(({ title }) => title)).toEqual([
      expect.stringMatching(/code source réel/i),
      expect.stringMatching(/données.*visible/i),
      expect.stringMatching(/aperçu/i),
      expect.stringMatching(/publication.*statique/i),
      expect.stringMatching(/url.*(?:live|ligne).*statique/i),
      expect.stringMatching(/itération.*conversation/i),
    ]);
  });

  it('keeps specification language, fabricated social proof, and unsupported metrics out of every locale', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const serialized = JSON.stringify(APP_BUILDER_COPY[language]);

      expect(serialized, `${language} contains specification language`).not.toMatch(BANNED_SPEC_LANGUAGE);
      expect(serialized, `${language} contains an unverified claim`).not.toMatch(BANNED_UNVERIFIED_CLAIMS);
      expect(serialized, `${language} contains a percentage claim`).not.toMatch(PERCENTAGE_CLAIM);
      expect(serialized, `${language} contains a large social-proof number`).not.toMatch(LARGE_SOCIAL_PROOF_NUMBER);
      expect(serialized, `${language} contains an unsupported one-click deployment claim`).not.toMatch(
        BANNED_ONE_CLICK_CLAIM,
      );
      expect(serialized, `${language} contains a categorical security claim`).not.toMatch(BANNED_CATEGORICAL_SECURITY);
    }
  });

  it('limits the IDE evidence to the real UI, generated files, and running Preview shown in the capture', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const proof = APP_BUILDER_COPY[language].proof;
      const serialized = JSON.stringify(proof);

      expect(proof.steps).toHaveLength(3);
      expect(proof.preview.alt).toMatch(/E-Code/i);
      expect(proof.iteration.alt).toMatch(/E-Code/i);

      for (const disclosurePattern of PROOF_DISCLOSURE_PATTERNS[language]) {
        expect(serialized, `${language} is missing a captured-project disclosure`).toMatch(disclosurePattern);
      }

      for (const disclaimerPattern of PROOF_DISCLAIMER_PATTERNS[language]) {
        expect(proof.disclaimer, `${language} proof disclaimer is incomplete`).toMatch(disclaimerPattern);
      }

      expect(proof.preview.body, `${language} must not present Preview as backend proof`).toMatch(
        NOT_BACKEND_PROOF_PATTERNS[language],
      );

      for (const connectionPattern of NOT_CONNECTED_PROOF_PATTERNS[language]) {
        expect(proof.preview.body, `${language} must disclose what Preview does not prove`).toMatch(connectionPattern);
      }

      expect(serialized, `${language} must describe the real correction shown in the second capture`).toMatch(
        /correction|corriger|corrección|تصحيح/i,
      );
      expect(
        proof.iteration.body,
        `${language} must attribute build validation to the independently exported project`,
      ).toMatch(/independent|indépendant|independiente|مستقلة/i);
    }
  });

  it('labels the browser demos as scripted page demonstrations rather than generation evidence', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const copy = APP_BUILDER_COPY[language];

      expect(copy.visuals.disclaimer, `${language} must separate the browser demo from IDE evidence`).toMatch(
        NOT_A_GENERATION_RECORD_PATTERNS[language],
      );
      expect(copy.visuals.disclaimer, `${language} must identify the browser demo as scripted`).toMatch(
        SCRIPTED_DEMO_PATTERNS[language],
      );
      expect(copy.prompt.intro, `${language} prompt copy must disclose the browser demo provenance`).toMatch(
        NOT_A_GENERATION_RECORD_PATTERNS[language],
      );
      expect(copy.prompt.intro, `${language} prompt copy must identify the browser demo as scripted`).toMatch(
        SCRIPTED_DEMO_PATTERNS[language],
      );
      expect(
        JSON.stringify(copy.prompt.demoLabels.statuses),
        `${language} demo statuses must describe coverage, not invented build state`,
      ).not.toMatch(BANNED_DEMO_STATUS_CLAIMS);
    }
  });

  it('limits built-in publishing to supported static builds and keeps server-backed projects exportable', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const copy = APP_BUILDER_COPY[language];
      const publishingCopy = `${copy.prompt.outputs[3].body} ${copy.deliverables.intro} ${copy.deliverables.items[3].body} ${copy.deliverables.items[4].body} ${copy.faq.items[2].answer}`;

      expect(publishingCopy, `${language} must name the current static-publishing limit`).toMatch(
        STATIC_PUBLISHING_PATTERNS[language],
      );
      expect(copy.deliverables.items[4].body, `${language} must preserve an export path for server projects`).toMatch(
        SERVER_EXPORT_PATTERNS[language],
      );
      expect(JSON.stringify(copy), `${language} must not promise unverified custom-domain routing`).not.toMatch(
        /CNAME|\bDNS\b/,
      );
    }
  });

  it('keeps unverified app auth, role, notification, and integration claims out of the feature list', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const copy = APP_BUILDER_COPY[language];

      expect(JSON.stringify(copy.features), `${language} contains an unverified generated-app feature`).not.toMatch(
        BANNED_UNVERIFIED_FEATURES,
      );
      expect(
        copy.faq.items[3].answer,
        `${language} must name the database connections verified in product code`,
      ).toMatch(/PostgreSQL.*MySQL.*MongoDB.*Redis/i);
    }
  });

  it('ships real browser captures in English and French with explicit loading and sizing contracts', () => {
    const ogPaths = ['en', 'fr'].map((language) =>
      resolve(process.cwd(), `public/assets/og/solutions/app-builder-${language}.png`),
    );

    const componentPath = resolve(process.cwd(), 'app/components/marketing/solutions/AppBuilderSolutionPage.tsx');

    for (const ogPath of ogPaths) {
      expect(existsSync(ogPath), `${ogPath} raster OG artwork`).toBe(true);
      expect(statSync(ogPath).size, `${ogPath} raster OG artwork must not be empty`).toBeGreaterThan(25_000);

      const artwork = readFileSync(ogPath);
      expect(artwork.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(artwork.readUInt32BE(16)).toBe(1200);
      expect(artwork.readUInt32BE(20)).toBe(630);
    }

    const componentSource = readFileSync(componentPath, 'utf8');
    expect(componentSource).toContain("loading={eager ? 'eager' : 'lazy'}");
    expect(componentSource).toContain("fetchpriority: eager ? 'high' : 'low'");
    expect(componentSource).toContain('decoding="async"');
    expect(componentSource).toContain('alt={content.alt}');
    expect(componentSource).toContain('width={asset.width}');
    expect(componentSource).toContain('height={asset.height}');
    expect(componentSource).toContain('data-visual-language={asset.language}');
    expect(componentSource).not.toMatch(
      /prompt-to-booking-app\.svg|mobile-booking-flow\.svg|team-schedule\.svg|client-reminder-flow\.svg/,
    );

    for (const visual of APP_BUILDER_VISUALS) {
      const assetPath = resolve(process.cwd(), 'public', visual.src.slice(1));

      expect(existsSync(assetPath), visual.src).toBe(true);
      expect(statSync(assetPath).size, `${visual.src} must contain a real raster capture`).toBeGreaterThan(25_000);

      const artwork = readFileSync(assetPath);
      expect(artwork.subarray(0, 8).toString('hex'), `${visual.src} PNG signature`).toBe('89504e470d0a1a0a');
      expect(artwork.subarray(12, 16).toString('ascii'), `${visual.src} IHDR chunk`).toBe('IHDR');
      expect(artwork.readUInt32BE(16), `${visual.src} intrinsic width`).toBe(visual.width);
      expect(artwork.readUInt32BE(20), `${visual.src} intrinsic height`).toBe(visual.height);
    }

    expect(new Set(APP_BUILDER_VISUALS.map(({ src }) => src)).size).toBe(12);
  });
});
