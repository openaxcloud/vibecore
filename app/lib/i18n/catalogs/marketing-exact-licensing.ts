import { resolveMarketingLanguage } from './marketing';

export type LicensingSectionId = 'platform' | 'ownership' | 'dependencies' | 'trademarks';

interface MarketingExactLicensingCopy {
  exactLicensing: {
    seo: {
      title: string;
      description: string;
      imageAlt: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      description: string;
    };
    sectionsTitle: string;
    sections: readonly {
      id: LicensingSectionId;
      title: string;
      body: string;
      points: readonly string[];
    }[];
  };
}

export const marketingExactLicensingEn = {
  exactLicensing: {
    seo: {
      title: 'Licensing — E-Code',
      description:
        'Learn how the E-Code platform is licensed under MIT and which licensing responsibilities apply to the apps you build.',
      imageAlt: 'E-Code platform and application licensing information',
    },
    hero: {
      eyebrow: 'Legal',
      title: 'Licensing',
      description: 'How the platform is licensed, and what applies to the apps you build with it.',
    },
    sectionsTitle: 'Licensing terms',
    sections: [
      {
        id: 'platform',
        title: 'Platform license (MIT)',
        body: 'The E-Code platform source is distributed under the MIT License and derives from the bolt.diy project. You may use, copy, modify and distribute it under the terms of that license, included in full in the project repository as LICENSE.',
        points: [],
      },
      {
        id: 'ownership',
        title: 'Your apps belong to you',
        body: 'Code and content you create with the AI agent in your workspace are yours. E-Code claims no ownership over the applications you build, and you are free to deploy, publish and relicense them as you see fit, subject to the licenses of any third-party dependencies you add.',
        points: [],
      },
      {
        id: 'dependencies',
        title: 'Third-party dependencies',
        body: 'Templates and generated projects may pull in open-source packages under their own licenses, including MIT, Apache-2.0 and BSD. You are responsible for complying with those licenses in anything you ship.',
        points: ['Review your dependency licenses before publishing', 'Keep attribution where a license requires it'],
      },
      {
        id: 'trademarks',
        title: 'Trademarks',
        body: 'The E-Code and VibeCore names and logos are trademarks of their respective owners. The MIT License does not grant permission to use them except to identify the platform.',
        points: [],
      },
    ],
  },
} as const satisfies MarketingExactLicensingCopy;

export const marketingExactLicensingFr = {
  exactLicensing: {
    seo: {
      title: 'Licences — E-Code',
      description:
        'Découvrez comment la plateforme E-Code est distribuée sous licence MIT et quelles obligations de licence concernent les applications que vous créez.',
      imageAlt: 'Informations sur les licences de la plateforme E-Code et des applications créées',
    },
    hero: {
      eyebrow: 'Centre juridique',
      title: 'Licences',
      description:
        'Découvrez la licence applicable à la plateforme et les règles qui concernent les applications que vous créez avec E-Code.',
    },
    sectionsTitle: 'Conditions de licence',
    sections: [
      {
        id: 'platform',
        title: 'Licence de la plateforme (MIT)',
        body: 'Le code source de la plateforme E-Code est distribué sous licence MIT et dérive du projet bolt.diy. Vous pouvez l’utiliser, le copier, le modifier et le distribuer dans le respect de cette licence, reproduite intégralement dans le fichier LICENSE du dépôt.',
        points: [],
      },
      {
        id: 'ownership',
        title: 'Vos applications vous appartiennent',
        body: 'Le code et les contenus que vous créez avec l’agent IA dans votre espace de travail vous appartiennent. E-Code ne revendique aucun droit de propriété sur les applications que vous créez. Vous pouvez les déployer, les publier et les placer sous la licence de votre choix, sous réserve des licences applicables aux dépendances tierces que vous ajoutez.',
        points: [],
      },
      {
        id: 'dependencies',
        title: 'Dépendances tierces',
        body: 'Les modèles et projets générés peuvent intégrer des paquets open source soumis à leurs propres licences, notamment MIT, Apache-2.0 et BSD. Il vous incombe de respecter ces licences pour tout ce que vous distribuez.',
        points: [
          'Vérifiez les licences de vos dépendances avant toute publication',
          'Conservez les mentions d’attribution lorsqu’une licence l’exige',
        ],
      },
      {
        id: 'trademarks',
        title: 'Marques',
        body: 'Les noms et logos E-Code et VibeCore sont des marques de leurs propriétaires respectifs. La licence MIT n’autorise pas leur utilisation, sauf pour identifier la plateforme.',
        points: [],
      },
    ],
  },
} as const satisfies MarketingExactLicensingCopy;

export function getMarketingExactLicensingCopy(language?: string | null): MarketingExactLicensingCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactLicensingFr : marketingExactLicensingEn;
}
