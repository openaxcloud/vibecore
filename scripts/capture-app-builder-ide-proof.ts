import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { chromium, expect, type Page } from '@playwright/test';

type CaptureLocale = 'en' | 'fr';
type CaptureSlug =
  | 'app-builder'
  | 'website-builder'
  | 'game-builder'
  | 'dashboard-builder'
  | 'chatbot-builder'
  | 'internal-ai-builder'
  | 'enterprise'
  | 'startups'
  | 'freelancers';

type SolutionScenario = {
  prompt: string;
  iterationPrompt: string;
  accountName: string;
  organizationName: string;
  expectedTerms: readonly string[];
  requiresDarkCanvas?: boolean;
  interaction: {
    role: 'button' | 'link';
    name: string;
    expectedResult: string;
  };
};

type PreviewImageLike = {
  complete: boolean;
  currentSrc: string;
  decode: () => Promise<unknown>;
  getBoundingClientRect: () => { height: number; width: number };
  naturalHeight: number;
  naturalWidth: number;
  src: string;
};

type RuntimeWorkspace = {
  id: string;
  status?: string;
};

type RuntimePreviewPort = {
  port?: number;
  processId?: string;
  ready?: boolean;
  type?: string;
  notReadyReason?: string;
  url?: string;
};

type CaptureSession = {
  email: string;
  password: string;
  projectId?: string;
};

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const API_BASE_URL = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const GENERATION_TIMEOUT_MS = 12 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = Number(process.env.SOLUTION_PROOF_PREVIEW_TIMEOUT_MS ?? 5 * 60 * 1000);
const PREVIEW_RESTART_TIMEOUT_MS = 3 * 60 * 1000;

const PREVIEW_RUNTIME_ERROR_PATTERN =
  /internal server error|failed to resolve import|cannot find module|vite error|unexpected token|uncaught typeerror|plugin:vite|preview_upstream_unreachable|dev server on port .*not reachable|starting, or it crashed/i;

const SOLUTION_SCENARIOS = {
  'app-builder': {
    en: {
      prompt: 'Create a booking app for my hair salon, with a calendar, customer accounts, and email reminders.',
      iterationPrompt:
        'Use orange for every primary action and remove every purple accent. Keep the salon booking workflows intact.',
      accountName: 'App Builder proof EN',
      organizationName: 'App Builder proof EN',
      expectedTerms: ['Salon', 'Appointments'],
      interaction: { role: 'link', name: 'Appointments', expectedResult: 'Appointments' },
    },
    fr: {
      prompt:
        'Crée une app de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email.',
      iterationPrompt:
        'Utilise l’orange pour toutes les actions principales et retire chaque accent violet. Garde les parcours de réservation du salon intacts.',
      accountName: 'Preuve App Builder FR',
      organizationName: 'Preuve App Builder FR',
      expectedTerms: ['Salon', 'Rendez-vous'],
      interaction: { role: 'link', name: 'Rendez-vous', expectedResult: 'Rendez-vous' },
    },
  },
  'website-builder': {
    en: {
      prompt:
        'Build a portfolio website for my architecture studio, with a project portfolio, contact form, and journal. Name it Meridian Studio. Use realistic fictional content and local sample data only. Create working Home, Projects, Studio, Journal, and Contact views. The contact form shows a local confirmation and never claims to send email. Use React and TypeScript with a concrete, warm limestone, black ink, and orange editorial theme. No purple.',
      iterationPrompt:
        'Refine Meridian Studio for the Webview proof. Add a Projects navigation link that opens a dedicated view headed Selected work, with working project filters and project detail links. Keep the local-only contact confirmation explicit. Make orange the action color, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'Website proof EN',
      organizationName: 'Website proof EN',
      expectedTerms: ['Meridian Studio', 'Projects', 'Contact'],
      interaction: { role: 'link', name: 'Projects', expectedResult: 'Selected work' },
    },
    fr: {
      prompt:
        'Fais-moi un site vitrine pour mon cabinet d’architecte, avec portfolio, contact et journal. Appelle-le Atelier Méridien. Utilise des contenus fictifs réalistes et uniquement des données locales. Crée des vues fonctionnelles Accueil, Projets, Studio, Journal et Contact. Le formulaire affiche une confirmation locale et ne prétend jamais envoyer un email. Utilise React et TypeScript avec un thème éditorial béton, pierre chaude, encre noire et orange. Aucun violet.',
      iterationPrompt:
        'Affine Atelier Méridien pour la preuve Webview. Ajoute un lien Projets qui ouvre une vue dédiée titrée Projets sélectionnés, avec filtres fonctionnels et fiches projet. Garde la confirmation locale du contact explicite. Réserve l’orange aux actions, retire tout violet, lance le typecheck et vérifie le vrai Webview.',
      accountName: 'Preuve Website FR',
      organizationName: 'Preuve Website FR',
      expectedTerms: ['Atelier Méridien', 'Projets', 'Contact'],
      interaction: { role: 'link', name: 'Projets', expectedResult: 'Projets sélectionnés' },
    },
  },
  'game-builder': {
    en: {
      prompt:
        'Create TriviaClash, a multiplayer-style quiz game demo with a lobby, timed questions, live local score updates, and a leaderboard. Use realistic fictional players and local in-memory data only; state clearly that no network multiplayer backend is connected. Build the working game flow in React and TypeScript. Use a dark arcade theme with cyan, lime, and orange actions. No purple.',
      iterationPrompt:
        'Make the TriviaClash demo fully testable in Webview. Add a Start quiz button that opens Question 1, a working answer selection, countdown, score update, and final leaderboard using local state. Keep the no-network-backend disclosure visible. Make primary actions orange, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'Game proof EN',
      organizationName: 'Game proof EN',
      expectedTerms: ['TriviaClash', 'Leaderboard', 'local'],
      requiresDarkCanvas: true,
      interaction: { role: 'button', name: 'Start quiz', expectedResult: 'Question 1' },
    },
    fr: {
      prompt:
        'Crée TriviaClash, une démo de quiz multijoueur avec lobby, questions chronométrées, score local en temps réel et classement. Utilise des joueurs fictifs réalistes et uniquement des données en mémoire ; indique clairement qu’aucun backend multijoueur réseau n’est connecté. Construis le parcours fonctionnel en React et TypeScript. Thème arcade sombre cyan, vert lime et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends la démo TriviaClash entièrement testable dans le Webview. Ajoute un bouton Démarrer le quiz qui ouvre Question 1, un choix de réponse fonctionnel, un compte à rebours, la mise à jour du score et le classement final en état local. Garde visible la limite sans backend réseau. Actions principales orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Game FR',
      organizationName: 'Preuve Game FR',
      expectedTerms: ['TriviaClash', 'Classement', 'local'],
      requiresDarkCanvas: true,
      interaction: { role: 'button', name: 'Démarrer le quiz', expectedResult: 'Question 1' },
    },
  },
  'dashboard-builder': {
    en: {
      prompt:
        'Create PipelineIQ, a sales dashboard connected to a clearly labeled local sample dataset, with revenue charts, pipeline stages, date and region filters, and a deals table. Do not claim a real external database connection. Build responsive accessible React and TypeScript views with a dense graphite, blue, green, and orange data theme. No purple.',
      iterationPrompt:
        'Improve PipelineIQ in Webview. Add working date and region controls plus an Apply filters button that updates every KPI and chart from local sample data and shows Filters applied. Include a target variance table. Keep the local-dataset disclosure visible. Make actions orange, remove every purple accent, run typecheck, and verify the real Webview.',
      accountName: 'Dashboard proof EN',
      organizationName: 'Dashboard proof EN',
      expectedTerms: ['PipelineIQ', 'Revenue', 'local sample'],
      interaction: { role: 'button', name: 'Apply filters', expectedResult: 'Filters applied' },
    },
    fr: {
      prompt:
        'Crée PipelineIQ, un tableau de bord commercial connecté à un jeu de données local clairement indiqué, avec graphiques de chiffre d’affaires, étapes du pipeline, filtres de date et de région, et tableau des affaires. Ne prétends pas être connecté à une vraie base externe. Construis des vues React et TypeScript accessibles et responsive, thème dense graphite, bleu, vert et orange. Aucun violet.',
      iterationPrompt:
        'Améliore PipelineIQ dans le Webview. Ajoute des contrôles fonctionnels de date et région puis un bouton Appliquer les filtres qui met à jour les KPI et graphiques depuis les données locales et affiche Filtres appliqués. Ajoute un tableau des écarts aux objectifs. Garde visible la limite des données locales. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Dashboard FR',
      organizationName: 'Preuve Dashboard FR',
      expectedTerms: ['PipelineIQ', 'Chiffre d’affaires', 'données locales'],
      interaction: { role: 'button', name: 'Appliquer les filtres', expectedResult: 'Filtres appliqués' },
    },
  },
  'chatbot-builder': {
    en: {
      prompt:
        'Create HelpDesk Copilot, a customer support assistant that answers from a small fictional product documentation set stored locally. Include suggested questions, a conversation view, cited source cards, and an escalation state. Do not claim a live LLM, vector database, or external helpdesk connection. Build it in accessible responsive React and TypeScript with blue, warm gray, and orange actions. No purple.',
      iterationPrompt:
        'Make HelpDesk Copilot demonstrably interactive in Webview. Add the suggested question button How do I reset my password?; clicking it must produce a deterministic local answer with a cited Account access source and an escalation option. Keep the local-documentation limitation visible. Actions orange, no purple, typecheck, then verify the actual Webview.',
      accountName: 'Chatbot proof EN',
      organizationName: 'Chatbot proof EN',
      expectedTerms: ['HelpDesk Copilot', 'Sources', 'local'],
      interaction: { role: 'button', name: 'How do I reset my password?', expectedResult: 'Account access' },
    },
    fr: {
      prompt:
        'Crée HelpDesk Copilot, un assistant support client qui répond depuis une petite documentation produit fictive stockée localement. Ajoute des questions suggérées, une conversation, des cartes sources citées et un état d’escalade. Ne prétends pas utiliser un LLM actif, une base vectorielle ou un helpdesk externe. Construis-le en React et TypeScript accessible et responsive, bleu, gris chaud et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends HelpDesk Copilot réellement interactif dans le Webview. Ajoute le bouton suggéré Comment réinitialiser mon mot de passe ? ; son clic produit une réponse locale déterministe avec la source citée Accès au compte et une option d’escalade. Garde visible la limite de documentation locale. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Chatbot FR',
      organizationName: 'Preuve Chatbot FR',
      expectedTerms: ['HelpDesk Copilot', 'Sources', 'local'],
      interaction: {
        role: 'button',
        name: 'Comment réinitialiser mon mot de passe ?',
        expectedResult: 'Accès au compte',
      },
    },
  },
  'internal-ai-builder': {
    en: {
      prompt:
        'Create PeopleOps, an internal HR procedure search workspace for employees. Use a fictional local policy library with permissions shown only as a UI demo, cited procedure cards, search history, and a feedback state. Do not claim real authentication, RAG, SSO, or external document connections. Build accessible responsive React and TypeScript with forest green, warm neutral, and orange actions. No purple.',
      iterationPrompt:
        'Make PeopleOps verifiable in Webview. Add an Annual leave policy suggestion; clicking it must show a deterministic local answer with cited procedure HR-04 and a feedback control. Keep the local-library and demo-permissions limitation visible. Actions orange, remove all purple, run typecheck, and verify the real Webview.',
      accountName: 'Internal AI proof EN',
      organizationName: 'Internal AI proof EN',
      expectedTerms: ['PeopleOps', 'HR-04', 'local'],
      interaction: { role: 'button', name: 'Annual leave policy', expectedResult: 'HR-04' },
    },
    fr: {
      prompt:
        'Crée PeopleOps, un espace interne de recherche dans les procédures RH pour les salariés. Utilise une bibliothèque fictive locale, des permissions présentées uniquement comme démo d’interface, des cartes de procédures citées, un historique et un état de feedback. Ne prétends pas avoir une authentification, un RAG, un SSO ou des documents externes réels. React et TypeScript accessibles et responsive, vert forêt, tons chauds et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends PeopleOps vérifiable dans le Webview. Ajoute la suggestion Politique de congés annuels ; son clic affiche une réponse locale déterministe avec la procédure citée RH-04 et un contrôle de feedback. Garde visible la limite de bibliothèque locale et permissions de démonstration. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Internal AI FR',
      organizationName: 'Preuve Internal AI FR',
      expectedTerms: ['PeopleOps', 'RH-04', 'locale'],
      interaction: { role: 'button', name: 'Politique de congés annuels', expectedResult: 'RH-04' },
    },
  },
  enterprise: {
    en: {
      prompt:
        'Create Northwind Control, a product release governance workspace for an enterprise software team. Include release readiness, approval checklist, environment status, ownership, and a local audit activity timeline. Treat SSO, RBAC, audit export, and deployment as interface demonstrations only; do not claim live enterprise integrations. Build accessible responsive React and TypeScript with graphite, steel blue, and orange actions. No purple.',
      iterationPrompt:
        'Make Northwind Control testable in Webview. Add a Review release button that opens an Approval checklist with owner, status, risk, and local approval controls. Keep the demo-only SSO, RBAC, audit, and deployment disclosure visible. Make primary actions orange, remove purple, run typecheck, and verify the actual Webview.',
      accountName: 'Enterprise proof EN',
      organizationName: 'Enterprise proof EN',
      expectedTerms: ['Northwind Control', 'Release', 'demonstration'],
      interaction: { role: 'button', name: 'Review release', expectedResult: 'Approval checklist' },
    },
    fr: {
      prompt:
        'Crée Northwind Control, un espace de gouvernance des mises en production pour une équipe logicielle d’entreprise. Ajoute la préparation de version, une checklist d’approbation, l’état des environnements, les responsables et un journal d’activité local. Présente le SSO, RBAC, export d’audit et déploiement uniquement comme démonstrations d’interface ; ne prétends pas avoir d’intégrations actives. React et TypeScript accessibles et responsive, graphite, bleu acier et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends Northwind Control testable dans le Webview. Ajoute un bouton Examiner la version qui ouvre une Checklist d’approbation avec responsable, statut, risque et contrôles locaux. Garde visible la limite de démonstration pour SSO, RBAC, audit et déploiement. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Enterprise FR',
      organizationName: 'Preuve Enterprise FR',
      expectedTerms: ['Northwind Control', 'Version', 'démonstration'],
      interaction: { role: 'button', name: 'Examiner la version', expectedResult: 'Checklist d’approbation' },
    },
  },
  startups: {
    en: {
      prompt:
        'Create Launchpad, a launch cockpit for an early-stage startup team. Include onboarding funnel, waitlist, experiment board, customer interview notes, product milestones, and runway inputs using realistic fictional local sample data. Do not claim live analytics, billing, email, or database integrations. Build accessible responsive React and TypeScript with coral, teal, graphite, and orange actions. No purple.',
      iterationPrompt:
        'Make Launchpad interactive in Webview. Add an Add experiment button that opens a New experiment form, saves a local experiment card, and updates the board count. Keep all external integrations explicitly unconnected. Make actions orange, remove purple, run typecheck, and verify the actual Webview.',
      accountName: 'Startups proof EN',
      organizationName: 'Startups proof EN',
      expectedTerms: ['Launchpad', 'Experiments', 'local'],
      interaction: { role: 'button', name: 'Add experiment', expectedResult: 'New experiment' },
    },
    fr: {
      prompt:
        'Crée Launchpad, un cockpit de lancement pour une équipe de startup en amorçage. Ajoute tunnel d’onboarding, liste d’attente, tableau d’expériences, notes d’entretiens clients, jalons produit et paramètres de trésorerie avec des données locales fictives réalistes. Ne prétends pas avoir d’analytics, billing, emails ou base externe actifs. React et TypeScript accessibles et responsive, corail, sarcelle, graphite et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends Launchpad interactif dans le Webview. Ajoute un bouton Ajouter une expérience qui ouvre un formulaire Nouvelle expérience, enregistre une carte locale et met à jour le compteur. Garde toutes les intégrations externes explicitement déconnectées. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Startups FR',
      organizationName: 'Preuve Startups FR',
      expectedTerms: ['Launchpad', 'Expériences', 'locales'],
      interaction: { role: 'button', name: 'Ajouter une expérience', expectedResult: 'Nouvelle expérience' },
    },
  },
  freelancers: {
    en: {
      prompt:
        'Create Studio Ferro, a client delivery workspace for a freelance designer. Include project status, deliverables, feedback threads, proposal, invoice status, time log, and a client approval flow using realistic fictional local data. Do not claim real payments, signatures, emails, or client authentication. Build accessible responsive React and TypeScript with clay, ink, sage, and orange actions. No purple.',
      iterationPrompt:
        'Make Studio Ferro demonstrably interactive in Webview. Add a Review delivery button that opens a deliverable panel headed Approval requested with local approve and request-changes controls. Keep payments, signatures, email, and auth explicitly unconnected. Make actions orange, remove purple, run typecheck, and verify the actual Webview.',
      accountName: 'Freelancers proof EN',
      organizationName: 'Freelancers proof EN',
      expectedTerms: ['Studio Ferro', 'Deliverables', 'local'],
      interaction: { role: 'button', name: 'Review delivery', expectedResult: 'Approval requested' },
    },
    fr: {
      prompt:
        'Crée Studio Ferro, un espace de livraison client pour un designer freelance. Ajoute statut du projet, livrables, fils de feedback, proposition, état de facture, suivi du temps et parcours de validation client avec des données locales fictives réalistes. Ne prétends pas avoir de paiements, signatures, emails ou authentification client réels. React et TypeScript accessibles et responsive, argile, encre, sauge et actions orange. Aucun violet.',
      iterationPrompt:
        'Rends Studio Ferro réellement interactif dans le Webview. Ajoute un bouton Examiner le livrable qui ouvre un panneau titré Validation demandée avec contrôles locaux approuver et demander des modifications. Garde paiements, signatures, emails et auth explicitement déconnectés. Actions orange, aucun violet, typecheck puis vérification du vrai Webview.',
      accountName: 'Preuve Freelancers FR',
      organizationName: 'Preuve Freelancers FR',
      expectedTerms: ['Studio Ferro', 'Livrables', 'locales'],
      interaction: { role: 'button', name: 'Examiner le livrable', expectedResult: 'Validation demandée' },
    },
  },
} as const satisfies Record<CaptureSlug, Record<CaptureLocale, SolutionScenario>>;

function readSlug(): CaptureSlug {
  const value = process.argv.find((argument) => argument.startsWith('--solution='))?.split('=')[1] ?? 'app-builder';

  if (value in SOLUTION_SCENARIOS) {
    return value as CaptureSlug;
  }

  throw new Error(`Unknown solution ${value}`);
}

function appBuilderFallback(slug: CaptureSlug, value: string | undefined) {
  return slug === 'app-builder' ? value?.trim() : undefined;
}

function creationPromptFor(slug: CaptureSlug, scenario: SolutionScenario) {
  const runtimeContract =
    slug === 'app-builder'
      ? ''
      : ' Keep the generated runtime deliberately reliable: a Vite React TypeScript frontend with a complete package.json dev script, index.html, src/main.tsx, and src/styles.css. Keep the entire working UI and local state in src/main.tsx and src/styles.css; do not create App.tsx or extra component files. Do not add tests, a backend, a router package, a component library, or any dependency beyond React, React DOM, TypeScript, and Vite. Bind Vite to 0.0.0.0. Save only complete valid source files. Never include antml, boltArtifact, boltAction, XML, or markdown wrappers in a saved file. Make the first rendered route immediately show the named product.';

  return `${scenario.prompt} Do not leave a generic starter or reuse unrelated template copy; the visible product name, content, and workflows must match this brief. Draw interface visuals in code or use bundled local assets only. Do not hotlink remote images, stock-photo services, fonts, scripts, or stylesheets.${runtimeContract}`;
}

function repairPromptFor(slug: CaptureSlug, scenario: SolutionScenario, attempt: number) {
  const configuredPrompt =
    process.env.SOLUTION_PROOF_REPAIR_PROMPT?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_REPAIR_PROMPT);

  const appIdentity = scenario.expectedTerms.join(', ');

  const basePrompt =
    configuredPrompt ??
    `The actual Webview is blank or contains a runtime error. Inspect the exact saved project files, current Vite diagnostics, and every entry in the IDE Problems panel. Replace every empty or truncated runtime file, remove accidental prose, markdown, boltArtifact, and boltAction wrappers from source files, then fix every TypeScript, import, syntax, test, and runtime error until Problems shows zero errors. Preserve this app's identity and verified local-only scope: ${appIdentity}. Remove remote image, font, script, and stylesheet URLs; use code-drawn or bundled local assets. Run typecheck, start the dev server, and only report success after the actual Webview contains the app. Do not add any external service, secret, or unsupported claim.`;

  if (attempt === 1) {
    return basePrompt;
  }

  return `${basePrompt} This is repair attempt ${attempt}; the previous repair still left the Webview invalid. Do not trust the previous success message. Re-read the exact current file contents and verify visible Webview text before answering.`;
}

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectCreationModel(page: Page) {
  const providerName = process.env.SOLUTION_PROOF_AI_PROVIDER?.trim();
  const modelName = process.env.SOLUTION_PROOF_AI_MODEL?.trim();

  if (!providerName && !modelName) {
    return;
  }

  if (providerName) {
    const providerCombobox = page.getByTestId('ai-provider-dropdown').getByRole('combobox', { name: 'AI provider' });

    const providerSelectorAvailable = await providerCombobox
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!providerSelectorAvailable) {
      process.stdout.write(`${JSON.stringify({ status: 'creation-model-selector-unavailable' })}\n`);

      return;
    }

    await providerCombobox.click();
    await page
      .getByRole('option', { name: new RegExp(escapedPattern(providerName), 'i') })
      .first()
      .click();
    await expect(providerCombobox).toContainText(new RegExp(escapedPattern(providerName), 'i'));
  }

  if (modelName) {
    const modelCombobox = page.getByTestId('ai-model-dropdown').getByRole('combobox', { name: 'AI model' });

    await expect(modelCombobox).toBeVisible({ timeout: 30_000 });
    await modelCombobox.click();
    await page
      .getByRole('option', { name: new RegExp(escapedPattern(modelName), 'i') })
      .first()
      .click();
    await expect(modelCombobox).toContainText(new RegExp(escapedPattern(modelName), 'i'));
  }
}

function readLocale(): CaptureLocale {
  const value = process.argv.find((argument) => argument.startsWith('--locale='))?.split('=')[1];

  if (value === 'en' || value === 'fr') {
    return value;
  }

  throw new Error('Pass --locale=en or --locale=fr');
}

async function waitForRateLimitReset(responseText: string, retryAfter: string | undefined, fallbackMs = 10_000) {
  const bodySeconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const headerSeconds = Number(retryAfter);
  const headerDateMs = retryAfter && !Number.isFinite(headerSeconds) ? Date.parse(retryAfter) - Date.now() : Number.NaN;

  const waitMs = Number.isFinite(headerSeconds)
    ? (headerSeconds + 1) * 1000
    : Number.isFinite(headerDateMs)
      ? Math.max(headerDateMs + 1_000, 1_000)
      : Number.isFinite(bodySeconds)
        ? (bodySeconds + 1) * 1000
        : fallbackMs;

  await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
}

async function authenticate(
  page: Page,
  slug: CaptureSlug,
  locale: CaptureLocale,
  copy: SolutionScenario,
  resumeSession?: CaptureSession,
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const existingEmail =
    resumeSession?.email ??
    process.env.SOLUTION_PROOF_EMAIL?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_EMAIL);

  const existingPassword =
    resumeSession?.password ??
    process.env.SOLUTION_PROOF_PASSWORD?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_PASSWORD);

  const registrationPassword = `Ecode-${randomBytes(24).toString('base64url')}-9a!`;

  if (existingEmail && !existingPassword) {
    throw new Error('SOLUTION_PROOF_PASSWORD is required when SOLUTION_PROOF_EMAIL is set');
  }

  let responseText = '';
  let payload: { token: string } | undefined;
  let authenticatedEmail = existingEmail;
  let authenticatedPassword = existingPassword;

  if (existingEmail) {
    const response = await page.request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: existingEmail, password: existingPassword },
    });

    responseText = await response.text();

    if (!response.ok()) {
      throw new Error(`Login failed (${response.status()}): ${responseText}`);
    }

    payload = JSON.parse(responseText) as { token: string };
  }

  for (let attempt = 0; !payload && attempt < 4; attempt += 1) {
    const registrationEmail = `${slug}-proof-${locale}-${suffix}-${attempt}@local.test`;

    const response = await page.request.post(`${API_BASE_URL}/auth/register`, {
      data: {
        email: registrationEmail,
        password: registrationPassword,
        name: copy.accountName,
        organizationName: `${copy.organizationName} ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      payload = JSON.parse(responseText) as { token: string };
      authenticatedEmail = registrationEmail;
      authenticatedPassword = registrationPassword;
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText, response.headers()['retry-after']);
      continue;
    }

    throw new Error(`Registration failed (${response.status()}): ${responseText}`);
  }

  if (!payload) {
    throw new Error(`Registration did not return a session: ${responseText}`);
  }

  if (!authenticatedEmail || !authenticatedPassword) {
    throw new Error('Authentication did not retain resumable proof credentials');
  }

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'vibecore-lang',
      value: locale,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);

  return { token: payload.token, email: authenticatedEmail, password: authenticatedPassword };
}

async function readCaptureSession(path: string) {
  const payload = JSON.parse(await readFile(path, 'utf8')) as Partial<CaptureSession>;

  if (!payload.email || !payload.password || !payload.projectId) {
    throw new Error('The local proof session is incomplete and cannot be resumed');
  }

  return payload as CaptureSession & { projectId: string };
}

async function persistCaptureSession(path: string, session: CaptureSession & { projectId: string }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(session)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);
}

async function resolveProjectId(page: Page, token: string) {
  const url = new URL(page.url());
  const legacyProjectId = url.pathname.match(/\/projects\/([^/]+)\/ide/)?.[1];

  if (legacyProjectId) {
    return legacyProjectId;
  }

  const canonicalMatch = url.pathname.match(/^\/@([^/]+)\/([^/?]+)\/?$/);

  if (!canonicalMatch) {
    throw new Error(`Could not read project route from ${page.url()}`);
  }

  const [, accountSlug, projectSlug] = canonicalMatch;

  const response = await page.request.get(
    `${API_BASE_URL}/projects/resolve?accountSlug=${encodeURIComponent(decodeURIComponent(accountSlug))}&projectSlug=${encodeURIComponent(decodeURIComponent(projectSlug))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!response.ok()) {
    throw new Error(`Project resolution failed (${response.status()}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { project?: { id?: string } };

  if (!payload.project?.id) {
    throw new Error(`Project resolution returned no id for ${page.url()}`);
  }

  return payload.project.id;
}

async function waitForGeneratedFiles(page: Page, projectId: string, token: string) {
  let lastPaths: string[] = [];

  await expect
    .poll(
      async () => {
        const projectState = await readProjectIdeState(page, projectId, token);

        if (!projectState) {
          return false;
        }

        lastPaths = projectState.files.flatMap((file) => (file.path ? [file.path] : []));

        const hasPackage = lastPaths.some((path) => /(^|\/)package\.json$/.test(path));
        const hasApplication = lastPaths.some((path) => /(^|\/)(App\.(?:tsx|jsx)|main\.(?:tsx|jsx|js))$/.test(path));

        return hasPackage && hasApplication;
      },
      {
        message: 'The real agent run must create package.json and application source files',
        intervals: [1_000, 2_000, 3_000],
        timeout: GENERATION_TIMEOUT_MS,
      },
    )
    .toBe(true);

  return lastPaths;
}

async function readProjectIdeState(page: Page, projectId: string, token: string) {
  try {
    const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/ide-state`, {
      headers: { authorization: `Bearer ${token}` },
      timeout: 20_000,
    });

    if (!response.ok()) {
      return undefined;
    }

    const payload = (await response.json()) as {
      ideState?: {
        version?: number;
        state?: {
          files?: {
            entries?: Array<{ path?: string; content?: string }>;
          };
        };
      } | null;
    };

    if (!payload.ideState) {
      return undefined;
    }

    return {
      version: payload.ideState.version,
      files: payload.ideState.state?.files?.entries ?? [],
    };
  } catch {
    return undefined;
  }
}

async function assertGeneratedSourcesAreUnwrapped(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new Error('The generated IDE state is unavailable before preview verification');
  }

  const invalidPaths = projectState.files.flatMap((file) => {
    const path = file.path ?? '';
    const content = file.content ?? '';
    const isRuntimeSource = /(?:^|\/)(?:package|tsconfig(?:\.node)?)\.json$|\.(?:css|html|jsx?|tsx?)$/i.test(path);

    return isRuntimeSource &&
      /<\/?antml(?::[\w-]+)?\b|<\/?bolt(?:Artifact|Action)\b|<\/?(?:function_calls|invoke|parameter)\b|```/i.test(
        content,
      )
      ? [path]
      : [];
  });

  if (invalidPaths.length > 0) {
    throw new Error(`Generated source contains response-wrapper markers: ${invalidPaths.join(', ')}`);
  }
}

async function resolveRuntimeWorkspace(page: Page, projectId: string, token: string) {
  const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/workspaces`, {
    headers: { authorization: `Bearer ${token}` },
    timeout: 20_000,
  });

  if (!response.ok()) {
    return undefined;
  }

  const payload = (await response.json()) as { workspaces?: RuntimeWorkspace[] };

  const candidates =
    payload.workspaces?.filter((workspace): workspace is RuntimeWorkspace => Boolean(workspace.id)) ?? [];

  for (const workspace of candidates) {
    const statusResponse = await page.request
      .get(`${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/status`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      })
      .catch(() => undefined);

    if (!statusResponse?.ok()) {
      continue;
    }

    const statusPayload = (await statusResponse.json()) as { status?: string };

    if (statusPayload.status === 'running') {
      return workspace;
    }
  }

  return candidates.find((workspace) => workspace.status === 'RUNNING') ?? candidates[0];
}

async function runtimeFileContent(page: Page, workspaceId: string, token: string, path: string) {
  const response = await page.request.get(
    `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      timeout: 20_000,
    },
  );

  if (!response.ok()) {
    return undefined;
  }

  const payload = (await response.json()) as { content?: string; encoding?: string };

  if (typeof payload.content !== 'string') {
    return undefined;
  }

  return payload.encoding === 'base64' ? Buffer.from(payload.content, 'base64').toString('utf8') : payload.content;
}

async function waitForRuntimeFilesToMatchPersisted(page: Page, projectId: string, token: string) {
  let lastMismatches: string[] = [];

  await expect
    .poll(
      async () => {
        const [workspace, projectState] = await Promise.all([
          resolveRuntimeWorkspace(page, projectId, token),
          readProjectIdeState(page, projectId, token),
        ]);

        if (!workspace || !projectState) {
          lastMismatches = ['runtime-or-ide-state-unavailable'];

          return lastMismatches.length;
        }

        const criticalFiles = projectState.files.filter((file) =>
          /(?:^|\/)(?:package\.json|index\.html|main\.(?:tsx|jsx|js)|styles\.css|App\.(?:tsx|jsx))$/i.test(
            file.path ?? '',
          ),
        );

        const comparisons = await Promise.all(
          criticalFiles.map(async (file) => ({
            path: file.path ?? '',
            matches:
              typeof file.content === 'string' &&
              file.content === (await runtimeFileContent(page, workspace.id, token, file.path ?? '')),
          })),
        );

        lastMismatches = comparisons.filter((comparison) => !comparison.matches).map((comparison) => comparison.path);

        return lastMismatches.length;
      },
      {
        message: 'The running workspace must match the authoritative persisted files before Preview starts',
        intervals: [2_000, 3_000, 5_000],
        timeout: PREVIEW_TIMEOUT_MS,
      },
    )
    .toBe(0);

  process.stdout.write(`${JSON.stringify({ status: 'runtime-files-synchronized' })}\n`);
}

async function readRuntimePreviewPorts(page: Page, projectId: string, token: string) {
  try {
    const workspace = await resolveRuntimeWorkspace(page, projectId, token);

    if (!workspace?.id) {
      return [];
    }

    const portsResponse = await page.request.get(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/ports`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      },
    );

    if (!portsResponse.ok()) {
      return [];
    }

    const portsPayload = (await portsResponse.json()) as RuntimePreviewPort[] | { ports?: RuntimePreviewPort[] };
    const ports = Array.isArray(portsPayload) ? portsPayload : (portsPayload.ports ?? []);

    return ports.filter((port) => port.ready === true && typeof port.port === 'number');
  } catch {
    return [];
  }
}

async function probeRuntimePreview(page: Page, projectId: string, token: string, port = 5173) {
  try {
    const [workspace, readyPorts] = await Promise.all([
      resolveRuntimeWorkspace(page, projectId, token),
      readRuntimePreviewPorts(page, projectId, token),
    ]);

    if (!workspace?.id || !readyPorts.some((entry) => entry.port === port)) {
      return false;
    }

    const response = await page.request.get(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/preview/${port}/proxy`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      },
    );

    if (!response.ok()) {
      return false;
    }

    const html = await response.text();

    return (
      /<html|<div[^>]+id=["']root["']|<script/i.test(html) &&
      html.length > 120 &&
      !/preview_upstream_unreachable|preview is starting|starting preview|loading e-code/i.test(html)
    );
  } catch {
    return false;
  }
}

async function runtimeDiagnosticSummary(page: Page, projectId: string, token: string) {
  const workspace = await resolveRuntimeWorkspace(page, projectId, token);

  if (!workspace?.id) {
    return { workspace: 'unavailable' };
  }

  const requestJson = async (endpoint: string) => {
    const response = await page.request
      .get(`${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      })
      .catch(() => undefined);

    return response?.ok() ? response.json().catch(() => undefined) : undefined;
  };

  const [status, portsPayload, processesPayload, diagnostics] = await Promise.all([
    requestJson('status'),
    requestJson('ports'),
    requestJson('processes'),
    requestJson('diagnostics'),
  ]);
  const ports = Array.isArray(portsPayload)
    ? portsPayload
    : ((portsPayload as { ports?: RuntimePreviewPort[] } | undefined)?.ports ?? []);
  const processes = Array.isArray(processesPayload)
    ? processesPayload
    : ((processesPayload as { processes?: unknown[] } | undefined)?.processes ?? []);
  const lifecycle = (diagnostics as { lifecycle?: Array<{ state?: string; reason?: string; at?: string }> } | undefined)
    ?.lifecycle;

  return {
    workspaceId: workspace.id,
    runtimeStatus: (status as { status?: string } | undefined)?.status,
    ports: ports.map((entry: RuntimePreviewPort) => ({
      port: entry.port,
      ready: entry.ready,
      process: Boolean(entry.processId),
      notReadyReason: entry.notReadyReason,
    })),
    processCount: processes.length,
    lastLifecycle: lifecycle?.at(-1),
    postMortemCount: (diagnostics as { postMortems?: unknown[] } | undefined)?.postMortems?.length ?? 0,
  };
}

async function waitForProjectToSettle(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
  message: string,
) {
  let previousRevision: string | undefined;
  let stableChecks = 0;

  await expect
    .poll(
      async () => {
        const revision = await projectFilesRevision(page, projectId, token);

        if (revision && revision === previousRevision) {
          stableChecks += 1;
        } else {
          stableChecks = 0;
          previousRevision = revision;
        }

        const composer = agentPanel.getByRole('textbox', { name: 'Agent prompt' });
        const composerReady = await composer.isEnabled().catch(() => false);

        const completedProgress = await agentPanel
          .locator('[aria-label*="Agent Done"][aria-label*="100%"]')
          .last()
          .isVisible()
          .catch(() => false);

        const stopGenerationButton = agentPanel.getByRole('button', { name: 'Stop generation' }).first();
        const generationStillRunning = await stopGenerationButton.isVisible().catch(() => false);

        if (Boolean(revision) && stableChecks >= 12) {
          if (generationStillRunning) {
            const stopped = await stopGenerationButton
              .click()
              .then(() => true)
              .catch(() => false);

            if (!stopped) {
              return false;
            }

            await expect(stopGenerationButton).toBeHidden({ timeout: 60_000 });
          }

          if (!(await composer.isEnabled().catch(() => false))) {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
            await expect(agentPanel).toBeVisible({ timeout: 180_000 });
            await expect(composer).toBeEnabled({ timeout: 60_000 });
          }

          return true;
        }

        return (
          Boolean(revision) && stableChecks >= 7 && composerReady && (completedProgress || !generationStillRunning)
        );
      },
      {
        message,
        intervals: [2_000, 3_000, 5_000],
        timeout: GENERATION_TIMEOUT_MS,
      },
    )
    .toBe(true);
}

async function projectFilesRevision(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState?.files.length) {
    return undefined;
  }

  const files = [...projectState.files]
    .sort((left, right) => (left.path ?? '').localeCompare(right.path ?? ''))
    .map((file) => ({ path: file.path ?? '', content: file.content ?? '' }));

  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

async function submitAgentPrompt(agentPanel: ReturnType<Page['getByTestId']>, prompt: string) {
  const composer = agentPanel.getByRole('textbox', { name: 'Agent prompt' });
  const stopButton = agentPanel.getByRole('button', { name: 'Stop generation' }).first();
  const quotaBlock = agentPanel.getByText(/quota exceeded|usage limit reached|insufficient credits/i).last();
  const preferredAgentMode = process.env.SOLUTION_PROOF_AGENT_MODE?.trim();

  await expect(composer).toBeVisible({ timeout: 60_000 });

  if (await quotaBlock.isVisible().catch(() => false)) {
    throw new Error('The proof account has no remaining Agent quota');
  }

  if (await stopButton.isVisible().catch(() => false)) {
    const completedProgress = agentPanel.locator('[aria-label*="Agent Done"][aria-label*="100%"]').last();

    await expect(completedProgress).toBeVisible({ timeout: 60_000 });
    await stopButton.click();
    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  }

  if (preferredAgentMode) {
    const modeButton = agentPanel.getByText(preferredAgentMode, { exact: true }).first();

    await expect(modeButton).toBeVisible({ timeout: 60_000 });
    await modeButton.click();
  }

  await composer.fill(prompt);
  await expect(composer).toHaveValue(prompt);
  await composer.press('Enter');

  if (
    await quotaBlock
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    throw new Error('The proof account exhausted its Agent quota before updating the project');
  }

  return composer;
}

async function repairGeneratedPreview(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
  repairPrompt: string,
) {
  const initialRevision = await projectFilesRevision(page, projectId, token);

  await submitAgentPrompt(agentPanel, repairPrompt);

  const repairBubble = agentPanel.locator('.bolt-chat-message-row-user').last();

  await expect(repairBubble).toBeVisible({ timeout: 60_000 });
  await expect(repairBubble).toContainText(repairPrompt.slice(0, 80), { timeout: 60_000 });

  const stopButton = agentPanel.getByRole('button', { name: /^Stop/i }).first();

  await stopButton.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => undefined);

  await expect
    .poll(() => projectFilesRevision(page, projectId, token), {
      message: 'The repair prompt must update at least one generated project file',
      intervals: [1_000, 2_000, 3_000],
      timeout: GENERATION_TIMEOUT_MS,
    })
    .not.toBe(initialRevision);

  await waitForProjectToSettle(
    page,
    agentPanel,
    projectId,
    token,
    'Repair files must stabilize and the agent must report completion',
  );

  return repairBubble;
}

async function waitForPreview(page: Page, evidenceRoot: string, projectId: string, token: string) {
  await assertGeneratedSourcesAreUnwrapped(page, projectId, token);
  await waitForRuntimeFilesToMatchPersisted(page, projectId, token);

  const webviewButton = page.getByRole('button', { name: 'Webview' }).first();

  await expect(webviewButton).toBeVisible({ timeout: 60_000 });
  await webviewButton.click();

  const previewNotRunningState = page.getByTestId('preview-not-running-state');
  const previewErrorAlert = page.getByRole('alert', { name: 'Preview Error' }).last();
  const iframe = page.locator('iframe[data-testid="preview-iframe"]:visible').last();
  const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

  let previewText = '';

  const readPreviewText = async () => {
    previewText = (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

    return PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText) ? 0 : previewText.length;
  };

  const throwIfVisiblePreviewError = async () => {
    if (!(await previewErrorAlert.isVisible().catch(() => false))) {
      return;
    }

    const detail = (await previewErrorAlert.innerText()).replace(/\s+/g, ' ').trim();

    throw new Error(`The IDE surfaced a Preview Error before rendering the app: ${detail.slice(0, 500)}`);
  };

  const startPreviewFromTerminal = async () => {
    const dependencyInstallCommand = 'npm install --include=dev --prefer-offline --no-audit --no-fund';
    const viteVersionCommand = 'node_modules/.bin/vite --version';
    const terminalTabs = page.getByTestId('terminal-tabs-bar');
    const openedTerminal = !(await terminalTabs.isVisible().catch(() => false));

    if (openedTerminal) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    }

    await expect(terminalTabs).toBeVisible({ timeout: 60_000 });

    const terminalScreen = page.locator('.xterm-screen:visible').last();
    const terminalRows = page.locator('.xterm-rows:visible').last();

    await expect(terminalScreen).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const rows = await terminalRows.innerText().catch(() => '');

          return /[$#]\s*$/m.test(rows);
        },
        {
          message: 'The IDE Terminal must expose an interactive workspace prompt before starting Vite',
          timeout: PREVIEW_RESTART_TIMEOUT_MS,
        },
      )
      .toBe(true);

    const terminalInput = page.locator('.xterm:visible').last().locator('textarea.xterm-helper-textarea');

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();

    await page.keyboard.type(dependencyInstallCommand);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must echo the dependency installation command before execution',
        timeout: 30_000,
      })
      .toContain(dependencyInstallCommand);
    await page.keyboard.press('Enter');
    process.stdout.write(`${JSON.stringify({ status: 'preview-terminal-install-requested' })}\n`);

    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The real IDE Terminal must complete the project dependency installation',
        timeout: PREVIEW_TIMEOUT_MS,
      })
      .toMatch(/(?:(?:added|changed|removed)\s+\d+\s+packages?|up to date)/i);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must return to an interactive prompt after installing dependencies',
        timeout: 60_000,
      })
      .toMatch(/[$#]\s*$/m);

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();
    await page.keyboard.type(viteVersionCommand);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The installed project must expose a real Vite executable before Preview starts',
        timeout: 60_000,
      })
      .toMatch(/(?:vite\/|vite\s+v)\d+\.\d+\.\d+/i);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must return after verifying Vite',
        timeout: 60_000,
      })
      .toMatch(/[$#]\s*$/m);
    process.stdout.write(`${JSON.stringify({ status: 'preview-vite-executable-verified' })}\n`);

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();
    await page.keyboard.type('npm run dev -- --host 0.0.0.0');
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must echo the requested Vite command before execution',
        timeout: 30_000,
      })
      .toContain('npm run dev -- --host 0.0.0.0');
    await page.keyboard.press('Enter');
    process.stdout.write(`${JSON.stringify({ status: 'preview-terminal-start-requested' })}\n`);

    await expect
      .poll(
        async () => {
          const rows = await terminalRows.innerText().catch(() => '');

          return (
            /(?:VITE\s+v\d|Local:\s+https?:\/\/|ready in\s+\d+\s*ms|Port 5173 is already in use|\[vite\]\s+hmr update)/i.test(
              rows,
            ) || (await probeRuntimePreview(page, projectId, token))
          );
        },
        {
          message: 'The real IDE Terminal or runtime proxy must confirm a running Vite server',
          timeout: PREVIEW_RESTART_TIMEOUT_MS,
        },
      )
      .toBe(true);

    const readyRuntimePorts = await readRuntimePreviewPorts(page, projectId, token);

    process.stdout.write(
      `${JSON.stringify({ status: 'preview-terminal-command-settled', runtimeReadyPortCount: readyRuntimePorts.length })}\n`,
    );

    if (openedTerminal) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
      await expect(terminalTabs).toBeHidden({ timeout: 60_000 });
    }

    await webviewButton.click();
  };

  try {
    const waitForPreviewSurface = () =>
      expect
        .poll(
          async () =>
            (await iframe.isVisible().catch(() => false)) ||
            (await previewNotRunningState.isVisible().catch(() => false)),
          {
            message: 'Webview must expose either its running iframe or the explicit preview start state',
            timeout: 60_000,
          },
        )
        .toBe(true);

    const startPreviewIfStopped = async () => {
      if (!(await previewNotRunningState.isVisible().catch(() => false))) {
        return false;
      }

      const previewRunButton = previewNotRunningState.getByRole('button', { name: 'Run to preview your app' }).first();

      if (await previewRunButton.isVisible().catch(() => false)) {
        await previewRunButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-start-requested' })}\n`);

        return true;
      }

      return false;
    };

    await waitForPreviewSurface();
    await startPreviewIfStopped();

    const attachedAfterStart = await iframe
      .waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!attachedAfterStart) {
      const reinstallDependenciesButton = previewNotRunningState
        .getByRole('button', { name: 'Reinstall dependencies' })
        .first();

      if (await reinstallDependenciesButton.isVisible().catch(() => false)) {
        await reinstallDependenciesButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-dependencies-reinstall-requested' })}\n`);
      }

      await expect
        .poll(
          async () =>
            (await iframe.isVisible().catch(() => false)) ||
            (await previewNotRunningState
              .getByRole('button', { name: 'Run to preview your app' })
              .isVisible()
              .catch(() => false)),
          {
            message: 'Dependency recovery must expose a runnable preview or attach its iframe',
            timeout: PREVIEW_RESTART_TIMEOUT_MS,
          },
        )
        .toBe(true);

      await startPreviewIfStopped();

      const attachedAfterDependencyRecovery = await iframe
        .waitFor({ state: 'visible', timeout: 90_000 })
        .then(() => true)
        .catch(() => false);

      if (!attachedAfterDependencyRecovery) {
        process.stdout.write(`${JSON.stringify({ status: 'preview-ide-reload-requested' })}\n`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
        await expect(webviewButton).toBeVisible({ timeout: 180_000 });
        await webviewButton.click();
        await waitForPreviewSurface();
        await startPreviewIfStopped();
        await expect(iframe).toBeVisible({ timeout: PREVIEW_RESTART_TIMEOUT_MS });
      }
    }

    const initialIframeSource = await iframe.getAttribute('src').catch(() => null);

    const renderedOnFirstAttach =
      !initialIframeSource || initialIframeSource === 'about:blank'
        ? false
        : await expect
            .poll(readPreviewText, {
              message: 'The running preview must attach to the Webview',
              timeout: 30_000,
            })
            .toBeGreaterThan(120)
            .then(() => true)
            .catch(() => false);

    if (!renderedOnFirstAttach) {
      await throwIfVisiblePreviewError();

      const iframeSource = await iframe.getAttribute('src').catch(() => null);
      const runtimePreviewReachable = await probeRuntimePreview(page, projectId, token);

      if (
        !runtimePreviewReachable &&
        (!iframeSource || iframeSource === 'about:blank' || (await readPreviewText()) === 0)
      ) {
        await startPreviewFromTerminal();
      }

      const refreshPreviewButton = page.getByRole('button', { name: 'Refresh preview' }).first();

      if (await refreshPreviewButton.isVisible().catch(() => false)) {
        await refreshPreviewButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-refresh-requested' })}\n`);
      }

      const renderedAfterRefresh = await expect
        .poll(readPreviewText, {
          message: 'The refreshed Webview must render substantial application content',
          timeout: 30_000,
        })
        .toBeGreaterThan(120)
        .then(() => true)
        .catch(() => false);

      if (!renderedAfterRefresh) {
        await throwIfVisiblePreviewError();
        process.stdout.write(`${JSON.stringify({ status: 'preview-final-attach-wait-requested' })}\n`);

        const refreshedAfterReloadButton = page.getByRole('button', { name: 'Refresh preview' }).first();

        if (await refreshedAfterReloadButton.isVisible().catch(() => false)) {
          await refreshedAfterReloadButton.click({ noWaitAfter: true });
        }

        await expect
          .poll(readPreviewText, {
            message: 'The reloaded IDE must attach the running application to Webview',
            timeout: PREVIEW_TIMEOUT_MS,
          })
          .toBeGreaterThan(120);
      }
    }
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '02-preview-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const diagnosticSummary = await runtimeDiagnosticSummary(page, projectId, token).catch(() => undefined);

    if (diagnosticSummary) {
      await writeFile(
        resolve(evidenceRoot, '02-preview-failed.json'),
        `${JSON.stringify(diagnosticSummary, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      );
      process.stdout.write(`${JSON.stringify({ status: 'preview-failed-diagnostics', ...diagnosticSummary })}\n`);
    }

    const previewStatus = await page
      .getByTestId('preview-not-running-state')
      .innerText()
      .catch(() => 'No visible preview status');

    throw new Error(`Preview stayed empty. Visible status: ${previewStatus.replace(/\s+/g, ' ').trim()}`, {
      cause: error,
    });
  }

  if (PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText)) {
    throw new Error(`Preview contains a runtime error: ${previewText.slice(0, 500)}`);
  }

  const assetAudit = await body.evaluate(async (previewBody) => {
    const previewDocument = previewBody.ownerDocument;
    const previewWindow = previewDocument.defaultView;

    await previewDocument.fonts?.ready;

    const images = Array.from(previewDocument.querySelectorAll('img')) as unknown as PreviewImageLike[];

    const visibleImages = images.filter((image) => {
      const bounds = image.getBoundingClientRect();
      const style = previewWindow?.getComputedStyle(image as never);

      return bounds.width > 0 && bounds.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none';
    });

    await Promise.all(
      visibleImages.map(async (image) => {
        if (image.complete) {
          return;
        }

        await Promise.race([
          image.decode().catch(() => undefined),
          new Promise((resolveImage) => setTimeout(resolveImage, 10_000)),
        ]);
      }),
    );

    const brokenImages = visibleImages
      .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => image.currentSrc || image.src);
    const remoteImages = visibleImages
      .map((image) => image.currentSrc || image.src)
      .filter((source) => {
        try {
          const url = new URL(source, previewDocument.location.href);

          return /^https?:$/.test(url.protocol) && url.origin !== previewDocument.location.origin;
        } catch {
          return true;
        }
      });

    return { brokenImages, remoteImages, visibleImageCount: visibleImages.length };
  });

  if (assetAudit.brokenImages.length > 0) {
    throw new Error(`Preview contains ${assetAudit.brokenImages.length} broken visible images`);
  }

  if (assetAudit.remoteImages.length > 0) {
    throw new Error(`Preview hotlinks ${assetAudit.remoteImages.length} remote images instead of local assets`);
  }

  const previewShot = await iframe.screenshot({ animations: 'disabled', type: 'png' });

  if (previewShot.byteLength < 20_000) {
    throw new Error(`Preview screenshot is unexpectedly small (${previewShot.byteLength} bytes)`);
  }

  return { iframe, previewText, assetAudit };
}

async function waitForOrangePreview(page: Page, evidenceRoot: string, timeoutMs = PREVIEW_TIMEOUT_MS) {
  let lastAudit = { orangeActionCount: 0, orangeCount: 0, purpleCount: 0 };

  try {
    await expect
      .poll(
        async () => {
          const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

          lastAudit = await body.evaluate((previewBody) => {
            const previewDocument = previewBody.ownerDocument;
            const previewWindow = previewDocument.defaultView;

            if (!previewWindow) {
              return { orangeActionCount: 0, orangeCount: 0, purpleCount: 0 };
            }

            const colors = new Set<string>();
            const interactiveColors = new Set<string>();

            for (const element of previewDocument.querySelectorAll('*')) {
              const style = previewWindow.getComputedStyle(element);

              const styleValues = [
                style.color,
                style.backgroundColor,
                style.borderTopColor,
                style.borderRightColor,
                style.borderBottomColor,
                style.borderLeftColor,
                style.outlineColor,
                style.fill,
                style.stroke,
              ];

              for (const value of styleValues) {
                if (value && value !== 'none' && value !== 'transparent') {
                  colors.add(value);
                }
              }

              if (
                element.matches('button, a[href], [role="button"], input[type="submit"]') &&
                element.getBoundingClientRect().width > 0 &&
                element.getBoundingClientRect().height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              ) {
                for (const value of styleValues) {
                  if (value && value !== 'none' && value !== 'transparent') {
                    interactiveColors.add(value);
                  }
                }
              }
            }

            let orangeCount = 0;
            let orangeActionCount = 0;
            let purpleCount = 0;

            for (const [colorSet, interactive] of [
              [colors, false],
              [interactiveColors, true],
            ] as const) {
              for (const color of colorSet) {
                const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*\/\s*([\d.]+)|[,\s]+([\d.]+))?/i);

                if (!match || Number(match[4] ?? match[5] ?? 1) === 0) {
                  continue;
                }

                const red = Number(match[1]) / 255;
                const green = Number(match[2]) / 255;
                const blue = Number(match[3]) / 255;
                const max = Math.max(red, green, blue);
                const min = Math.min(red, green, blue);
                const delta = max - min;

                if (delta === 0) {
                  continue;
                }

                let hue = 0;

                if (max === red) {
                  hue = ((green - blue) / delta) % 6;
                } else if (max === green) {
                  hue = (blue - red) / delta + 2;
                } else {
                  hue = (red - green) / delta + 4;
                }

                hue = Math.round(hue * 60);

                if (hue < 0) {
                  hue += 360;
                }

                const lightness = (max + min) / 2;
                const saturation = delta / (1 - Math.abs(2 * lightness - 1));

                if (saturation < 0.38 || lightness < 0.2 || lightness > 0.82) {
                  continue;
                }

                if (hue >= 10 && hue <= 42) {
                  if (interactive) {
                    orangeActionCount += 1;
                  } else {
                    orangeCount += 1;
                  }
                }

                if (!interactive && hue >= 255 && hue <= 345) {
                  purpleCount += 1;
                }
              }
            }

            return { orangeActionCount, orangeCount, purpleCount };
          });

          return lastAudit.orangeActionCount > 0 && lastAudit.orangeCount > 0 && lastAudit.purpleCount === 0;
        },
        {
          message:
            'The refreshed Preview must contain an orange interactive action and no purple, violet, mauve, or pink accents',
          timeout: timeoutMs,
        },
      )
      .toBe(true);
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '04-orange-preview-audit-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    throw new Error(
      `Preview accent audit failed (orange actions=${lastAudit.orangeActionCount}, orange=${lastAudit.orangeCount}, purple=${lastAudit.purpleCount})`,
      { cause: error },
    );
  }

  return lastAudit;
}

async function verifyScenarioPreview(page: Page, scenario: SolutionScenario, evidenceRoot: string) {
  const frame = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last();
  const body = frame.locator('body');
  const identity = scenario.expectedTerms[0];
  const initialBodyText = (await body.innerText()).replace(/\s+/g, ' ').trim();

  if (!initialBodyText.toLocaleLowerCase().includes(identity.toLocaleLowerCase())) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '05-theme-verification-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });
    throw new Error(`Generated Preview is missing its theme-specific identity: ${identity}`);
  }

  const target = frame.getByRole(scenario.interaction.role, { name: scenario.interaction.name, exact: true }).first();

  const beforeInteraction = await body.evaluate((previewBody) => ({
    html: previewBody.innerHTML,
    location: previewBody.ownerDocument.defaultView?.location.href ?? '',
  }));

  await expect(target).toBeVisible({ timeout: 60_000 });
  await target.click();
  await expect(body).toContainText(scenario.interaction.expectedResult, { timeout: 60_000 });

  await expect
    .poll(
      () =>
        body.evaluate((previewBody, before) => {
          const location = previewBody.ownerDocument.defaultView?.location.href ?? '';

          return previewBody.innerHTML !== before.html || location !== before.location;
        }, beforeInteraction),
      {
        message: `Clicking ${scenario.interaction.name} must change the rendered app state or route`,
        timeout: 60_000,
      },
    )
    .toBe(true);

  const interactedBodyText = (await body.innerText()).replace(/\s+/g, ' ').trim();

  const missingTerms = scenario.expectedTerms.filter(
    (term) => !interactedBodyText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
  );

  if (missingTerms.length > 0) {
    throw new Error(`Interacted Preview is missing theme-specific terms: ${missingTerms.join(', ')}`);
  }

  const interactiveCount = await frame
    .locator(
      'button:visible:not([disabled]), a:visible[href], input:visible:not([disabled]), select:visible:not([disabled])',
    )
    .count();

  if (interactiveCount < 3) {
    throw new Error(`Generated Preview exposes only ${interactiveCount} interactive controls`);
  }

  return {
    interaction: `${scenario.interaction.role}:${scenario.interaction.name}`,
    expectedResult: scenario.interaction.expectedResult,
    interactiveCount,
  };
}

async function verifyScenarioIdentity(page: Page, scenario: SolutionScenario, timeout = 10_000) {
  const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');
  const identity = scenario.expectedTerms[0];

  await expect(body).toContainText(identity, { timeout });
}

async function verifyScenarioAppearance(page: Page, scenario: SolutionScenario) {
  if (!scenario.requiresDarkCanvas) {
    return;
  }

  const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

  const darkSurfaceCount = await body.evaluate((previewBody) => {
    const previewDocument = previewBody.ownerDocument;
    const previewWindow = previewDocument.defaultView;

    if (!previewWindow) {
      return 0;
    }

    let count = 0;

    for (const element of previewDocument.querySelectorAll('body, #root, main, [data-app-shell]')) {
      const bounds = element.getBoundingClientRect();
      const style = previewWindow.getComputedStyle(element);
      const match = style.backgroundColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);

      if (!match || bounds.width < previewWindow.innerWidth * 0.7 || bounds.height < previewWindow.innerHeight * 0.5) {
        continue;
      }

      const red = Number(match[1]) / 255;
      const green = Number(match[2]) / 255;
      const blue = Number(match[3]) / 255;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (luminance <= 0.3) {
        count += 1;
      }
    }

    return count;
  });

  if (darkSurfaceCount === 0) {
    throw new Error(`The ${scenario.expectedTerms[0]} Preview does not render the requested dark full-canvas theme`);
  }
}

async function prepareIdeCapture(page: Page, bubble: ReturnType<Page['locator']>) {
  const dismissPreviewError = page.getByTestId('ide-agent-panel').getByRole('button', { name: 'Dismiss' }).last();

  if (await dismissPreviewError.isVisible().catch(() => false)) {
    await dismissPreviewError.click();
  }

  const hideLogsButton = page.getByRole('button', { name: /Hide workspace logs/i }).first();

  if (await hideLogsButton.isVisible().catch(() => false)) {
    await hideLogsButton.click();
  }

  const closePreviewLogsButton = page.getByRole('button', { name: 'Close right panel' }).first();

  if (await closePreviewLogsButton.isVisible().catch(() => false)) {
    await closePreviewLogsButton.click();
  }

  await bubble.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
  await page.evaluate(`document.activeElement && document.activeElement.blur();`);
  await page.evaluate(`document.fonts && document.fonts.ready`);
}

async function selectPreviewDevice(page: Page, device: 'desktop' | 'tablet' | 'mobile') {
  const deviceSelect = page.getByRole('combobox', { name: 'Preview device' }).last();

  await expect(deviceSelect).toBeVisible({ timeout: 60_000 });
  await deviceSelect.selectOption(device);
  await expect(deviceSelect).toHaveValue(device);
  await expect(page.locator(`.bolt-project-webview-frame[data-preview-device="${device}"]:visible`).last()).toBeVisible(
    {
      timeout: 60_000,
    },
  );
}

async function main() {
  const slug = readSlug();
  const locale = readLocale();
  const copy: SolutionScenario = SOLUTION_SCENARIOS[slug][locale];
  const creationPrompt = creationPromptFor(slug, copy);
  const repairOnly = process.argv.includes('--repair-only');
  const iterationOnly = process.argv.includes('--iteration-only');
  const resume = process.argv.includes('--resume');

  const outputRoot = resolve(process.cwd(), 'public/assets/solutions', slug, locale);
  const evidenceRoot = resolve(process.cwd(), 'outputs/solutions', slug, 'ide-proof', locale);
  const captureSessionPath = resolve(evidenceRoot, '.capture-session.json');
  const resumeSession = resume ? await readCaptureSession(captureSessionPath) : undefined;

  const configuredEmail =
    process.env.SOLUTION_PROOF_EMAIL?.trim() ?? appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_EMAIL);

  const existingProjectId =
    process.env.SOLUTION_PROOF_PROJECT_ID?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_PROJECT_ID) ??
    resumeSession?.projectId;
  const iterationPrompt =
    process.env.SOLUTION_PROOF_ITERATION_PROMPT?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_ITERATION_PROMPT) ??
    (slug === 'app-builder' ? undefined : copy.iterationPrompt);
  const browserProfile =
    process.env.SOLUTION_PROOF_BROWSER_PROFILE?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_BROWSER_PROFILE);

  if (existingProjectId && !configuredEmail && !resumeSession) {
    throw new Error('SOLUTION_PROOF_EMAIL is required when SOLUTION_PROOF_PROJECT_ID is provided');
  }

  if ((repairOnly || iterationOnly) && !existingProjectId) {
    throw new Error('--repair-only and --iteration-only require an existing SOLUTION_PROOF_PROJECT_ID');
  }

  const contextOptions = {
    baseURL: APP_BASE_URL,
    colorScheme: 'dark' as const,
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    reducedMotion: 'reduce' as const,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
  };

  const browser = browserProfile ? undefined : await chromium.launch({ headless: true });

  let context = browserProfile
    ? await chromium.launchPersistentContext(resolve(browserProfile), { headless: true, ...contextOptions })
    : await browser!.newContext(contextOptions);

  try {
    await context.addInitScript(`
      localStorage.setItem('bolt_theme', 'dark');
      localStorage.setItem('vibecore-project-ide-guided-tour-v1', 'complete');
    `);

    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const previewConsoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.setDefaultNavigationTimeout(180_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());

        const locationUrl = message.location().url;

        if (locationUrl && !locationUrl.startsWith(APP_BASE_URL) && !locationUrl.startsWith(API_BASE_URL)) {
          previewConsoleErrors.push(message.text());
        }
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const { token, email, password } = await authenticate(page, slug, locale, copy, resumeSession);

    let projectId = existingProjectId;

    if (projectId) {
      await page.goto(`/projects/${encodeURIComponent(projectId)}/ide`, {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
    } else {
      await page.goto('/projects/new', { waitUntil: 'domcontentloaded', timeout: 180_000 });

      await mkdir(evidenceRoot, { recursive: true });
      await page.screenshot({
        path: resolve(evidenceRoot, '00-project-new.png'),
        animations: 'disabled',
        caret: 'hide',
      });

      const promptField = page.locator('textarea[name="prompt"]');

      await expect(promptField).toBeVisible({ timeout: 120_000 });

      const dismissOnboarding = page.getByRole('button', { name: 'Not now' });

      if (await dismissOnboarding.isVisible().catch(() => false)) {
        await dismissOnboarding.click();
      }

      const providerDropdown = page.getByTestId('ai-provider-dropdown').getByRole('combobox', { name: 'AI provider' });

      if (await providerDropdown.isVisible().catch(() => false)) {
        await expect(providerDropdown).toContainText(/Anthropic|OpenAI|Google/, { timeout: 30_000 });
        await expect(
          page.getByTestId('ai-model-dropdown').getByRole('combobox', { name: 'AI model' }),
        ).not.toContainText('No option available');
      }

      await selectCreationModel(page);

      await promptField.fill(creationPrompt);
      await page.getByRole('button', { name: 'Create project' }).click();
      await page.waitForURL(/(?:\/projects\/[^/]+\/ide|\/@[^/]+\/[^/?]+)(?:\?.*)?$/, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });

      projectId = await resolveProjectId(page, token);
    }

    if (!projectId) {
      throw new Error('No project id available for capture');
    }

    if (!configuredEmail) {
      await persistCaptureSession(captureSessionPath, { email, password, projectId });
    }

    process.stdout.write(`${JSON.stringify({ status: 'project-ready', slug, locale, projectId })}\n`);

    const agentPanel = page.getByTestId('ide-agent-panel');
    const originalPromptBubble = agentPanel.getByText(creationPrompt, { exact: true }).first();
    await expect(agentPanel).toBeVisible({ timeout: 180_000 });

    const originalPromptVisible = await originalPromptBubble
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    const promptBubble = originalPromptVisible
      ? originalPromptBubble
      : agentPanel.locator('.bolt-chat-message-row-user').first();

    await expect(promptBubble).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('.bolt-file-tree-name').first()).toBeVisible({ timeout: 180_000 });

    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '01-agent-started.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const generatedFiles = await waitForGeneratedFiles(page, projectId, token);

    if (!repairOnly && !iterationOnly) {
      await waitForProjectToSettle(
        page,
        agentPanel,
        projectId,
        token,
        'Generated files must stabilize and the agent composer must become active again',
      );
    }

    process.stdout.write(
      `${JSON.stringify({ status: 'initial-generation-settled', locale, generatedFiles: generatedFiles.length })}\n`,
    );

    if (repairOnly) {
      const repairPrompt = repairPromptFor(slug, copy, 1);
      const repairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, repairPrompt);
      const { previewText } = await waitForPreview(page, evidenceRoot, projectId, token);

      await repairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          locale,
          projectId,
          repairPrompt,
          generatedFilesUpdated: true,
          previewVerified: true,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
      await context.close();
      context = undefined!;

      return;
    }

    let previewText = '';
    let lastRepairBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let lastRepairPrompt: string | undefined;
    let iterationRepairBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let iterationRepairPrompt: string | undefined;

    const iterationBrief = iterationPrompt ? `${iterationPrompt} ` : '';

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try {
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token));
        break;
      } catch (previewError) {
        if (iterationOnly || attempt === 3) {
          throw previewError;
        }

        lastRepairPrompt = repairPromptFor(slug, copy, attempt + 1);
        lastRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, lastRepairPrompt);
      }
    }

    if (lastRepairBubble && lastRepairPrompt) {
      await lastRepairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          status: 'preview-repaired',
          locale,
          projectId,
          repairPrompt: lastRepairPrompt,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
    }

    try {
      await verifyScenarioIdentity(page, copy);
    } catch {
      const identityRepairPrompt = `${iterationBrief}The visible Webview is still an unrelated generic template and does not implement the requested ${copy.expectedTerms[0]} product. Replace all generic starter branding, copy, sample metrics, and workflows with the dedicated brief from my original prompt. The rendered interface must visibly contain these exact theme terms: ${copy.expectedTerms.join(', ')}. Use only realistic fictional local sample content, label limitations clearly, and remove fabricated performance, adoption, revenue, customer, or delivery claims. Keep every asset local, keep primary actions orange, and use no purple. Verify the actual Webview before answering.`;

      iterationRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, identityRepairPrompt);
      iterationRepairPrompt = identityRepairPrompt;
      ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token));
      await verifyScenarioIdentity(page, copy, 60_000);
    }

    const promptOutput = resolve(outputRoot, 'ide-agent-prompt.png');
    const previewOutput = resolve(outputRoot, 'ide-agent-preview.png');
    const webviewOverviewOutput = resolve(outputRoot, 'ide-webview-overview.png');
    await mkdir(dirname(previewOutput), { recursive: true });

    let initialAccentAudit: { orangeActionCount: number; orangeCount: number; purpleCount: number } | undefined;

    if (!iterationOnly) {
      try {
        await verifyScenarioAppearance(page, copy);
        initialAccentAudit = await waitForOrangePreview(page, evidenceRoot, 60_000);
      } catch {
        const themeRepairPrompt = `${iterationBrief}The actual Webview for ${copy.expectedTerms[0]} does not match the requested palette. Preserve every existing workflow and local-only limitation, remove every purple, violet, mauve, and pink accent, and use orange for visible primary actions. ${copy.requiresDarkCanvas ? 'Render the entire application on a deliberate dark full-canvas surface with styled controls; do not leave browser-default white UI.' : ''} Keep all images, fonts, scripts, and styles local. Verify the rendered Webview before reporting success.`;

        iterationRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, themeRepairPrompt);
        iterationRepairPrompt = themeRepairPrompt;
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token));
        await verifyScenarioAppearance(page, copy);
        initialAccentAudit = await waitForOrangePreview(page, evidenceRoot);
      }

      await selectPreviewDevice(page, 'desktop');
      await prepareIdeCapture(page, promptBubble);
      await page.screenshot({ path: promptOutput, animations: 'disabled', caret: 'hide' });

      const completedAgentBubble = agentPanel.locator('.bolt-chat-message-row-assistant').last();

      const previewBubble = (await completedAgentBubble.isVisible().catch(() => false))
        ? completedAgentBubble
        : promptBubble;

      await prepareIdeCapture(page, previewBubble);
      await page.screenshot({ path: previewOutput, animations: 'disabled', caret: 'hide' });

      await selectPreviewDevice(page, 'tablet');
      await prepareIdeCapture(page, promptBubble);
      await page.screenshot({ path: webviewOverviewOutput, animations: 'disabled', caret: 'hide' });
      await selectPreviewDevice(page, 'desktop');
    }

    let iterationBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let accentAudit = initialAccentAudit;
    let scenarioAudit: Awaited<ReturnType<typeof verifyScenarioPreview>>;
    let iterationOutput: string | undefined;
    let webviewIterationOutput: string | undefined;

    if (iterationPrompt) {
      if (iterationRepairBubble && iterationRepairPrompt) {
        iterationBubble = iterationRepairBubble;
        await expect(iterationBubble).toBeVisible({ timeout: 60_000 });
        await expect(iterationBubble).toContainText(iterationPrompt.slice(0, 80), { timeout: 60_000 });
      } else {
        const initialRevision = await projectFilesRevision(page, projectId, token);
        const previousLastBubble = agentPanel.locator('.bolt-chat-message-row-user').last();

        const previousIterationText = (await previousLastBubble.innerText().catch(() => ''))
          .replace(/\s+/g, ' ')
          .trim();

        if (!previousIterationText.includes(iterationPrompt.slice(0, 80))) {
          await submitAgentPrompt(agentPanel, iterationPrompt);
        }

        iterationBubble = agentPanel.locator('.bolt-chat-message-row-user').last();
        await expect(iterationBubble).toBeVisible({ timeout: 60_000 });
        await expect(iterationBubble).toContainText(iterationPrompt.slice(0, 80), { timeout: 60_000 });

        await expect
          .poll(() => projectFilesRevision(page, projectId, token), {
            message: 'The orange-theme iteration must update at least one generated project file',
            intervals: [1_000, 2_000, 3_000],
            timeout: GENERATION_TIMEOUT_MS,
          })
          .not.toBe(initialRevision);
        await waitForProjectToSettle(
          page,
          agentPanel,
          projectId,
          token,
          'Orange-theme files must stabilize and the agent composer must become active again',
        );
      }

      process.stdout.write(`${JSON.stringify({ status: 'orange-iteration-settled', locale })}\n`);

      ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token));
      await verifyScenarioAppearance(page, copy);
      accentAudit = await waitForOrangePreview(page, evidenceRoot);
      scenarioAudit = await verifyScenarioPreview(page, copy, evidenceRoot);
      await prepareIdeCapture(page, iterationBubble);
      iterationOutput = resolve(outputRoot, 'ide-agent-iteration.png');
      await page.screenshot({ path: iterationOutput, animations: 'disabled', caret: 'hide' });

      await selectPreviewDevice(page, 'mobile');
      await prepareIdeCapture(page, iterationBubble);
      webviewIterationOutput = resolve(outputRoot, 'ide-webview-iteration.png');
      await page.screenshot({ path: webviewIterationOutput, animations: 'disabled', caret: 'hide' });
      await selectPreviewDevice(page, 'desktop');
    } else {
      scenarioAudit = await verifyScenarioPreview(page, copy, evidenceRoot);
    }

    const editorButton = page.getByRole('button', { name: 'Editor' }).first();

    if (await editorButton.isVisible().catch(() => false)) {
      await editorButton.click();

      const appFile = page
        .locator(
          '.bolt-file-tree-name[title="App.tsx"], .bolt-file-tree-name[title="App.jsx"], .bolt-file-tree-name[title="main.tsx"], .bolt-file-tree-name[title="main.jsx"]',
        )
        .first();

      if (await appFile.isVisible().catch(() => false)) {
        await appFile.click();
      }

      await promptBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(outputRoot, 'ide-agent-files.png'),
        animations: 'disabled',
        caret: 'hide',
      });
    }

    const problemsButton = page.getByRole('button', { name: /^Open Problems\./ }).first();
    const problemsSummary = await problemsButton.getAttribute('aria-label').catch(() => null);

    let problemDetailCount = 0;

    if (await problemsButton.isVisible().catch(() => false)) {
      await problemsButton.click();

      const problemsPanel = page.getByRole('region', { name: 'Problems' });

      if (await problemsPanel.isVisible().catch(() => false)) {
        problemDetailCount = await problemsPanel.locator('.bolt-project-problem-item').count();
      }
    }

    if (problemDetailCount > 0) {
      throw new Error(`Generated project still exposes ${problemDetailCount} IDE problems`);
    }

    if (previewConsoleErrors.length > 0) {
      throw new Error(`Generated Preview emitted ${previewConsoleErrors.length} console errors`);
    }

    process.stdout.write(
      JSON.stringify(
        {
          locale,
          projectId,
          prompt: creationPrompt,
          generatedFileCount: generatedFiles.length,
          previewTextSample: previewText.slice(0, 240),
          consoleErrorCount: consoleErrors.length,
          previewConsoleErrorCount: previewConsoleErrors.length,
          pageErrorCount: pageErrors.length,
          previewOutput,
          promptOutput,
          webviewOverviewOutput,
          iterationOutput,
          webviewIterationOutput,
          accentAudit,
          scenarioAudit,
          problemsSummary,
          problemDetailCount,
        },
        null,
        2,
      ) + '\n',
    );

    await context.close();
    context = undefined!;

    if (process.env.SOLUTION_PROOF_KEEP_SESSION !== '1') {
      await unlink(captureSessionPath).catch(() => undefined);
    }
  } finally {
    await context?.close();
    await browser?.close();
  }
}

await main();
