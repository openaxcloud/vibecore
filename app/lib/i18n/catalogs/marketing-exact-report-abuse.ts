import { resolveMarketingLanguage } from './marketing';

export type AbuseReportType = 'code' | 'content' | 'harassment' | 'spam' | 'copyright' | 'privacy' | 'other';
export type AbuseViolationId = 'illegal' | 'code' | 'harassment' | 'spam' | 'privacy' | 'inappropriate';

export interface MarketingExactReportAbuseCopy {
  exactReportAbuse: {
    mailto: {
      subject: string;
      reportType: string;
      targetUrl: string;
      username: string;
      reporterEmail: string;
      pagePath: string;
      description: string;
    };
    errors: { submit: string };
    toasts: {
      openingTitle: string;
      openingDescription: string;
      submittedTitle: string;
      submittedDescription: string;
      fallbackDescription: string;
    };
    eyebrow: string;
    title: string;
    description: string;
    violationsIntro: { title: string; description: string };
    violations: readonly { id: AbuseViolationId; title: string; description: string }[];
    form: {
      title: string;
      description: string;
      typeLabel: string;
      types: readonly { id: AbuseReportType; label: string }[];
      urlLabel: string;
      urlHelp: string;
      usernameLabel: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      emailLabel: string;
      emailHelp: string;
      confirmation: string;
      submitting: string;
      submit: string;
    };
    dmca: { title: string; description: string; action: string };
    emergency: { title: string; description: string };
    process: { title: string; steps: readonly string[] };
    warning: string;
    moreInformation: string;
    terms: string;
    and: string;
    guidelines: string;
  };
}

export const marketingExactReportAbuseEn = {
  exactReportAbuse: {
    mailto: {
      subject: 'E-Code abuse report',
      reportType: 'Report type',
      targetUrl: 'Target URL',
      username: 'Username',
      reporterEmail: 'Reporter email',
      pagePath: 'Page path',
      description: 'Description',
    },
    errors: { submit: 'Failed to submit abuse report.' },
    toasts: {
      openingTitle: 'Opening email client',
      openingDescription: 'Your report details were prepared for abuse@e-code.ai.',
      submittedTitle: 'Report submitted',
      submittedDescription:
        'Thank you for helping keep E-Code safe. We will review your report and take appropriate action.',
      fallbackDescription: 'We could not reach the server, so we prepared your report for abuse@e-code.ai instead.',
    },
    eyebrow: 'Trust & Safety',
    title: 'Report Abuse',
    description:
      'Help us maintain a safe and productive environment for all E-Code users. If you encountered content or behavior that violates our policies, please report it here.',
    violationsIntro: {
      title: 'What constitutes abuse on E-Code?',
      description: 'We take the following violations seriously and investigate all reports.',
    },
    violations: [
      {
        id: 'illegal',
        title: 'Illegal Content',
        description:
          'Content that violates laws, including copyright infringement, malware distribution, or illegal activities.',
      },
      {
        id: 'code',
        title: 'Harmful or Malicious Code',
        description: 'Code designed to harm systems, steal data, or compromise security.',
      },
      {
        id: 'harassment',
        title: 'Harassment or Bullying',
        description: 'Targeted harassment, threats, or intimidation of other users.',
      },
      {
        id: 'spam',
        title: 'Spam or Scams',
        description: 'Unsolicited promotional content, phishing attempts, or fraudulent schemes.',
      },
      {
        id: 'privacy',
        title: 'Privacy Violations',
        description: 'Sharing personal information without consent or doxxing.',
      },
      {
        id: 'inappropriate',
        title: 'Inappropriate Content',
        description: 'Adult content, graphic violence, or content inappropriate for our community.',
      },
    ],
    form: {
      title: 'Submit a Report',
      description: 'Please provide as much detail as possible to help us investigate.',
      typeLabel: 'Type of abuse',
      types: [
        { id: 'code', label: 'Malicious or harmful code' },
        { id: 'content', label: 'Inappropriate content' },
        { id: 'harassment', label: 'Harassment or bullying' },
        { id: 'spam', label: 'Spam or scams' },
        { id: 'copyright', label: 'Copyright infringement' },
        { id: 'privacy', label: 'Privacy violation' },
        { id: 'other', label: 'Other' },
      ],
      urlLabel: 'URL of the content',
      urlHelp: 'Please provide the direct link to the project, profile, or comment.',
      usernameLabel: 'Username of the violator (if applicable)',
      descriptionLabel: 'Description of the issue',
      descriptionPlaceholder:
        'Please describe the issue in detail. Include relevant context, such as when the incident occurred, what specifically violates our policies, and any evidence you can provide.',
      emailLabel: 'Your email (optional)',
      emailHelp: 'Provide your email if you would like us to follow up on this report.',
      confirmation: 'I confirm that this report is made in good faith and the information provided is accurate.',
      submitting: 'Submitting…',
      submit: 'Submit Report',
    },
    dmca: {
      title: 'DMCA Takedown Requests',
      description: 'For copyright infringement claims, please submit a formal DMCA takedown notice.',
      action: 'DMCA Process',
    },
    emergency: {
      title: 'Emergency Contact',
      description: 'For urgent safety concerns or illegal activity, contact us immediately.',
    },
    process: {
      title: 'What happens after I submit a report?',
      steps: [
        'Our Trust & Safety team reviews all reports within 24–48 hours',
        'We investigate the reported content against our Community Guidelines',
        'Appropriate action is taken, which may include content removal or account suspension',
        'If you provided an email, we will notify you of the outcome when possible',
      ],
    },
    warning: 'False reports or abuse of the reporting system may result in account penalties.',
    moreInformation: 'For more information, see our',
    terms: 'Terms of Service',
    and: 'and',
    guidelines: 'Community Guidelines',
  },
} as const satisfies MarketingExactReportAbuseCopy;

export const marketingExactReportAbuseFr = {
  exactReportAbuse: {
    mailto: {
      subject: 'Signalement d’abus E-Code',
      reportType: 'Type de signalement',
      targetUrl: 'URL concernée',
      username: 'Nom d’utilisateur',
      reporterEmail: 'E-mail de la personne qui signale',
      pagePath: 'Chemin de la page',
      description: 'Description',
    },
    errors: { submit: 'Impossible d’envoyer le signalement.' },
    toasts: {
      openingTitle: 'Ouverture de votre messagerie',
      openingDescription: 'Les informations de votre signalement ont été préparées pour abuse@e-code.ai.',
      submittedTitle: 'Signalement envoyé',
      submittedDescription:
        'Merci de contribuer à la sécurité d’E-Code. Nous allons examiner votre signalement et prendre les mesures appropriées.',
      fallbackDescription: 'Le serveur est injoignable. Votre signalement a donc été préparé pour abuse@e-code.ai.',
    },
    eyebrow: 'Confiance et sécurité',
    title: 'Signaler un abus',
    description:
      'Aidez-nous à préserver un environnement sûr et productif pour tous les utilisateurs d’E-Code. Si vous avez rencontré un contenu ou un comportement contraire à nos règles, signalez-le ici.',
    violationsIntro: {
      title: 'Qu’est-ce qui constitue un abus sur E-Code ?',
      description: 'Nous prenons les violations suivantes au sérieux et examinons chaque signalement.',
    },
    violations: [
      {
        id: 'illegal',
        title: 'Contenu illégal',
        description:
          'Contenu contraire à la loi, notamment les atteintes au droit d’auteur, la diffusion de logiciels malveillants ou les activités illégales.',
      },
      {
        id: 'code',
        title: 'Code nuisible ou malveillant',
        description: 'Code conçu pour endommager des systèmes, voler des données ou compromettre la sécurité.',
      },
      {
        id: 'harassment',
        title: 'Harcèlement ou intimidation',
        description: 'Harcèlement ciblé, menaces ou intimidation envers d’autres utilisateurs.',
      },
      {
        id: 'spam',
        title: 'Spam ou escroquerie',
        description: 'Contenu promotionnel non sollicité, tentative de phishing ou dispositif frauduleux.',
      },
      {
        id: 'privacy',
        title: 'Atteinte à la vie privée',
        description: 'Partage d’informations personnelles sans consentement ou divulgation malveillante de données.',
      },
      {
        id: 'inappropriate',
        title: 'Contenu inapproprié',
        description: 'Contenu pour adultes, violence explicite ou contenu inadapté à notre communauté.',
      },
    ],
    form: {
      title: 'Envoyer un signalement',
      description: 'Fournissez autant de précisions que possible pour faciliter notre enquête.',
      typeLabel: 'Type d’abus',
      types: [
        { id: 'code', label: 'Code malveillant ou nuisible' },
        { id: 'content', label: 'Contenu inapproprié' },
        { id: 'harassment', label: 'Harcèlement ou intimidation' },
        { id: 'spam', label: 'Spam ou escroquerie' },
        { id: 'copyright', label: 'Atteinte au droit d’auteur' },
        { id: 'privacy', label: 'Atteinte à la vie privée' },
        { id: 'other', label: 'Autre' },
      ],
      urlLabel: 'URL du contenu',
      urlHelp: 'Indiquez le lien direct vers le projet, le profil ou le commentaire.',
      usernameLabel: 'Nom d’utilisateur de l’auteur présumé (le cas échéant)',
      descriptionLabel: 'Description du problème',
      descriptionPlaceholder:
        'Décrivez précisément le problème. Ajoutez tout contexte pertinent : date de l’incident, règle enfreinte et éléments de preuve disponibles.',
      emailLabel: 'Votre e-mail (facultatif)',
      emailHelp: 'Indiquez votre e-mail si vous souhaitez recevoir un suivi de ce signalement.',
      confirmation:
        'Je confirme que ce signalement est fait de bonne foi et que les informations fournies sont exactes.',
      submitting: 'Envoi en cours…',
      submit: 'Envoyer le signalement',
    },
    dmca: {
      title: 'Demandes de retrait DMCA',
      description: 'Pour toute atteinte au droit d’auteur, envoyez une notification formelle de retrait DMCA.',
      action: 'Procédure DMCA',
    },
    emergency: {
      title: 'Contact d’urgence',
      description: 'Pour tout risque urgent de sécurité ou toute activité illégale, contactez-nous immédiatement.',
    },
    process: {
      title: 'Que se passe-t-il après l’envoi d’un signalement ?',
      steps: [
        'Notre équipe Confiance et sécurité examine tous les signalements sous 24 à 48 heures',
        'Nous comparons le contenu signalé à nos Règles de la communauté',
        'Nous prenons les mesures appropriées, pouvant inclure la suppression du contenu ou la suspension du compte',
        'Si vous avez fourni un e-mail, nous vous informerons du résultat lorsque cela est possible',
      ],
    },
    warning: 'Les faux signalements ou l’usage abusif du système peuvent entraîner des sanctions sur le compte.',
    moreInformation: 'Pour en savoir plus, consultez nos',
    terms: 'Conditions d’utilisation',
    and: 'et nos',
    guidelines: 'Règles de la communauté',
  },
} as const satisfies MarketingExactReportAbuseCopy;

export function getMarketingExactReportAbuseCopy(language?: string | null): MarketingExactReportAbuseCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactReportAbuseFr : marketingExactReportAbuseEn;
}
