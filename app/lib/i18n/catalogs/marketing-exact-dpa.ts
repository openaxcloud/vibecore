import { resolveMarketingLanguage } from './marketing';

type DpaBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: readonly string[] }
  | { type: 'definition'; term: string; text: string }
  | { type: 'subprocessorsLink'; before: string; link: string; after: string };

interface MarketingExactDpaCopy {
  exactDpa: {
    title: string;
    introduction: string;
    sections: readonly { id: string; title: string; blocks: readonly DpaBlock[] }[];
    download: string;
    downloadSubject: string;
    contact: string;
    contactSubject: string;
    lastUpdated: string;
    effectiveDate: string;
    effectiveValue: string;
    contactPrefix: string;
  };
}

export const marketingExactDpaEn = {
  exactDpa: {
    title: 'Data Processing Agreement',
    introduction:
      'This Data Processing Agreement (“DPA”) forms part of the Contract for Services (“Principal Agreement”) between E-Code and the Customer.',
    sections: [
      {
        id: 'definitions',
        title: '1. Definitions',
        blocks: [
          {
            type: 'definition',
            term: 'Data Controller',
            text: 'means the entity that determines the purposes and means of the Processing of Personal Data.',
          },
          {
            type: 'definition',
            term: 'Data Processor',
            text: 'means the entity that Processes Personal Data on behalf of the Data Controller.',
          },
          {
            type: 'definition',
            term: 'GDPR',
            text: 'means the General Data Protection Regulation (EU) 2016/679.',
          },
          {
            type: 'definition',
            term: 'Personal Data',
            text: 'means any information relating to an identified or identifiable natural person.',
          },
          {
            type: 'definition',
            term: 'Processing',
            text: 'means any operation performed on Personal Data.',
          },
          {
            type: 'definition',
            term: 'Subprocessor',
            text: 'means any person appointed by or on behalf of the Processor to Process Personal Data on behalf of the Customer.',
          },
        ],
      },
      {
        id: 'processing',
        title: '2. Processing of Personal Data',
        blocks: [
          { type: 'heading', text: '2.1 Roles of the Parties' },
          {
            type: 'paragraph',
            text: 'The parties acknowledge and agree that, with regard to the Processing of Personal Data, the Customer is the Data Controller and E-Code is the Data Processor.',
          },
          { type: 'heading', text: '2.2 Customer Processing Instructions' },
          {
            type: 'paragraph',
            text: 'E-Code shall Process Personal Data only on documented instructions from the Customer.',
          },
          { type: 'heading', text: '2.3 Purpose Limitation' },
          {
            type: 'paragraph',
            text: 'E-Code shall Process Personal Data only for the purposes described in Annex 1.',
          },
        ],
      },
      {
        id: 'personnel',
        title: '3. E-Code Personnel',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall ensure that personnel engaged in the Processing of Personal Data are informed of its confidential nature, receive appropriate training, and execute written confidentiality agreements.',
          },
        ],
      },
      {
        id: 'security',
        title: '4. Security',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall implement and maintain appropriate technical and organizational measures to protect Personal Data against accidental or unlawful destruction, loss, alteration, unauthorized disclosure, or access.',
          },
          { type: 'heading', text: 'Security measures include:' },
          {
            type: 'list',
            items: [
              'Encryption of Personal Data in transit and at rest',
              'Regular security assessments and penetration testing',
              'Access controls and authentication mechanisms',
              'Regular backups and disaster recovery procedures',
              'Employee security training and awareness programs',
            ],
          },
        ],
      },
      {
        id: 'subprocessors',
        title: '5. Subprocessors',
        blocks: [
          {
            type: 'paragraph',
            text: 'The Customer acknowledges and agrees that E-Code may engage third-party Subprocessors in connection with the provision of the Services.',
          },
          {
            type: 'subprocessorsLink',
            before: 'E-Code maintains a list of current Subprocessors at',
            link: 'e-code.ai/subprocessors',
            after: '.',
          },
          {
            type: 'paragraph',
            text: 'E-Code shall notify the Customer of any intended addition or replacement of Subprocessors and give the Customer an opportunity to object to the change.',
          },
        ],
      },
      {
        id: 'rights',
        title: '6. Data Subject Rights',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall assist the Customer in fulfilling its obligations to respond to requests from data subjects exercising rights under applicable data protection laws, including:',
          },
          {
            type: 'list',
            items: [
              'Access to their Personal Data',
              'Rectification of Personal Data',
              'Erasure of Personal Data',
              'Data portability',
              'Restriction of Processing',
              'Objection to Processing',
            ],
          },
        ],
      },
      {
        id: 'breach',
        title: '7. Personal Data Breach',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall notify the Customer without undue delay after becoming aware of a Personal Data Breach affecting Customer Personal Data and provide sufficient information for the Customer to meet any obligation to report the breach or inform Data Subjects.',
          },
        ],
      },
      {
        id: 'impact-assessment',
        title: '8. Data Protection Impact Assessment and Prior Consultation',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall provide reasonable assistance with any data protection impact assessment and prior consultation with supervisory authorities that the Customer reasonably considers required under applicable data protection laws.',
          },
        ],
      },
      {
        id: 'deletion',
        title: '9. Deletion or Return of Personal Data',
        blocks: [
          {
            type: 'paragraph',
            text: 'Upon termination of the Services, E-Code shall, at the Customer’s option, delete or return all Personal Data and delete existing copies unless applicable law requires their retention.',
          },
        ],
      },
      {
        id: 'audit',
        title: '10. Audit Rights',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall make available all information necessary to demonstrate compliance with this DPA and allow for and contribute to audits, including inspections, conducted by the Customer or its mandated auditor.',
          },
        ],
      },
      {
        id: 'transfers',
        title: '11. International Transfers',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code shall not transfer Personal Data outside the European Economic Area without the Customer’s prior written consent and appropriate safeguards, such as:',
          },
          {
            type: 'list',
            items: [
              'Standard Contractual Clauses',
              'Adequacy decisions',
              'Binding Corporate Rules',
              'Other legally recognized transfer mechanisms',
            ],
          },
        ],
      },
      {
        id: 'annex',
        title: 'Annex 1: Details of Processing',
        blocks: [
          { type: 'heading', text: 'Nature and Purpose of Processing' },
          {
            type: 'paragraph',
            text: 'E-Code will Process Personal Data as necessary to provide the Services under the Principal Agreement.',
          },
          { type: 'heading', text: 'Duration of Processing' },
          {
            type: 'paragraph',
            text: 'E-Code will Process Personal Data for the duration of the Principal Agreement unless otherwise agreed in writing.',
          },
          { type: 'heading', text: 'Categories of Data Subjects' },
          {
            type: 'list',
            items: ['Customer end users', 'Customer employees', 'Customer contractors', 'Customer business partners'],
          },
          { type: 'heading', text: 'Types of Personal Data' },
          {
            type: 'list',
            items: [
              'Names and contact information',
              'Account credentials',
              'Usage data and analytics',
              'Content created within the Services',
              'Payment information processed by third-party payment processors',
            ],
          },
        ],
      },
    ],
    download: 'Download PDF',
    downloadSubject: 'Request for Data Processing Agreement (DPA)',
    contact: 'Contact Legal',
    contactSubject: 'DPA inquiry',
    lastUpdated: 'Last updated',
    effectiveDate: 'Effective date',
    effectiveValue: 'Upon execution of the Principal Agreement',
    contactPrefix: 'For questions about this DPA, contact our Data Protection Officer at',
  },
} as const satisfies MarketingExactDpaCopy;

export const marketingExactDpaFr = {
  exactDpa: {
    title: 'Accord de traitement des données',
    introduction:
      'Le présent Accord de traitement des données (« DPA ») fait partie du Contrat de services (« Accord principal ») conclu entre E-Code et le Client.',
    sections: [
      {
        id: 'definitions',
        title: '1. Définitions',
        blocks: [
          {
            type: 'definition',
            term: 'Responsable du traitement',
            text: 'désigne l’entité qui détermine les finalités et les moyens du Traitement des Données personnelles.',
          },
          {
            type: 'definition',
            term: 'Sous-traitant',
            text: 'désigne l’entité qui Traite les Données personnelles pour le compte du Responsable du traitement.',
          },
          {
            type: 'definition',
            term: 'RGPD',
            text: 'désigne le Règlement général sur la protection des données (UE) 2016/679.',
          },
          {
            type: 'definition',
            term: 'Données personnelles',
            text: 'désigne toute information se rapportant à une personne physique identifiée ou identifiable.',
          },
          {
            type: 'definition',
            term: 'Traitement',
            text: 'désigne toute opération effectuée sur des Données personnelles.',
          },
          {
            type: 'definition',
            term: 'Sous-traitant ultérieur',
            text: 'désigne toute personne nommée par le Sous-traitant ou pour son compte afin de Traiter des Données personnelles pour le compte du Client.',
          },
        ],
      },
      {
        id: 'processing',
        title: '2. Traitement des Données personnelles',
        blocks: [
          { type: 'heading', text: '2.1 Rôles des Parties' },
          {
            type: 'paragraph',
            text: 'Les Parties reconnaissent et conviennent que, pour le Traitement des Données personnelles, le Client agit en qualité de Responsable du traitement et E-Code en qualité de Sous-traitant.',
          },
          { type: 'heading', text: '2.2 Instructions de Traitement du Client' },
          {
            type: 'paragraph',
            text: 'E-Code ne Traite les Données personnelles que sur instruction documentée du Client.',
          },
          { type: 'heading', text: '2.3 Limitation des finalités' },
          {
            type: 'paragraph',
            text: 'E-Code ne Traite les Données personnelles qu’aux fins décrites à l’Annexe 1.',
          },
        ],
      },
      {
        id: 'personnel',
        title: '3. Personnel d’E-Code',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code veille à ce que le personnel participant au Traitement soit informé du caractère confidentiel des Données personnelles, reçoive une formation appropriée et signe des engagements écrits de confidentialité.',
          },
        ],
      },
      {
        id: 'security',
        title: '4. Sécurité',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code met en œuvre et maintient des mesures techniques et organisationnelles appropriées afin de protéger les Données personnelles contre toute destruction, perte, altération, divulgation ou accès accidentel ou illicite.',
          },
          { type: 'heading', text: 'Les mesures de sécurité comprennent notamment :' },
          {
            type: 'list',
            items: [
              'Le chiffrement des Données personnelles en transit et au repos',
              'Des évaluations de sécurité et tests d’intrusion réguliers',
              'Des contrôles d’accès et mécanismes d’authentification',
              'Des sauvegardes régulières et procédures de reprise après sinistre',
              'Des programmes de formation et de sensibilisation du personnel à la sécurité',
            ],
          },
        ],
      },
      {
        id: 'subprocessors',
        title: '5. Sous-traitants ultérieurs',
        blocks: [
          {
            type: 'paragraph',
            text: 'Le Client reconnaît et accepte qu’E-Code puisse faire appel à des Sous-traitants ultérieurs dans le cadre de la fourniture des Services.',
          },
          {
            type: 'subprocessorsLink',
            before: 'E-Code tient à jour la liste de ses Sous-traitants ultérieurs à l’adresse',
            link: 'e-code.ai/subprocessors',
            after: '.',
          },
          {
            type: 'paragraph',
            text: 'E-Code informe le Client de tout ajout ou remplacement envisagé d’un Sous-traitant ultérieur et lui donne la possibilité de s’y opposer.',
          },
        ],
      },
      {
        id: 'rights',
        title: '6. Droits des personnes concernées',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code aide le Client à remplir ses obligations de réponse aux demandes des personnes concernées exerçant leurs droits en vertu des lois applicables, notamment :',
          },
          {
            type: 'list',
            items: [
              'Accès à leurs Données personnelles',
              'Rectification de leurs Données personnelles',
              'Effacement de leurs Données personnelles',
              'Portabilité des données',
              'Limitation du Traitement',
              'Opposition au Traitement',
            ],
          },
        ],
      },
      {
        id: 'breach',
        title: '7. Violation de Données personnelles',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code informe le Client dans les meilleurs délais après avoir pris connaissance d’une Violation affectant les Données personnelles du Client et lui fournit les informations suffisantes pour satisfaire à toute obligation de notification ou d’information des personnes concernées.',
          },
        ],
      },
      {
        id: 'impact-assessment',
        title: '8. Analyse d’impact et consultation préalable',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code fournit une assistance raisonnable pour toute analyse d’impact relative à la protection des données et toute consultation préalable auprès des autorités de contrôle que le Client estime raisonnablement requise par les lois applicables.',
          },
        ],
      },
      {
        id: 'deletion',
        title: '9. Suppression ou restitution des Données personnelles',
        blocks: [
          {
            type: 'paragraph',
            text: 'À la fin des Services, E-Code supprime ou restitue, au choix du Client, toutes les Données personnelles et supprime les copies existantes, sauf obligation légale de conservation.',
          },
        ],
      },
      {
        id: 'audit',
        title: '10. Droits d’audit',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code met à la disposition du Client toutes les informations nécessaires pour démontrer le respect du présent DPA et permet les audits, y compris les inspections, menés par le Client ou l’auditeur qu’il mandate, et y contribue.',
          },
        ],
      },
      {
        id: 'transfers',
        title: '11. Transferts internationaux',
        blocks: [
          {
            type: 'paragraph',
            text: 'E-Code ne transfère aucune Donnée personnelle hors de l’Espace économique européen sans l’accord écrit préalable du Client et sans garanties appropriées, telles que :',
          },
          {
            type: 'list',
            items: [
              'Les Clauses contractuelles types',
              'Les décisions d’adéquation',
              'Les règles d’entreprise contraignantes',
              'Tout autre mécanisme de transfert reconnu par la loi',
            ],
          },
        ],
      },
      {
        id: 'annex',
        title: 'Annexe 1 : Détails du Traitement',
        blocks: [
          { type: 'heading', text: 'Nature et finalité du Traitement' },
          {
            type: 'paragraph',
            text: 'E-Code Traite les Données personnelles dans la mesure nécessaire à la fourniture des Services au titre de l’Accord principal.',
          },
          { type: 'heading', text: 'Durée du Traitement' },
          {
            type: 'paragraph',
            text: 'E-Code Traite les Données personnelles pendant toute la durée de l’Accord principal, sauf accord écrit contraire.',
          },
          { type: 'heading', text: 'Catégories de personnes concernées' },
          {
            type: 'list',
            items: [
              'Utilisateurs finaux du Client',
              'Salariés du Client',
              'Prestataires du Client',
              'Partenaires commerciaux du Client',
            ],
          },
          { type: 'heading', text: 'Types de Données personnelles' },
          {
            type: 'list',
            items: [
              'Noms et coordonnées',
              'Identifiants de compte',
              'Données d’utilisation et d’analyse',
              'Contenu créé dans les Services',
              'Informations de paiement traitées par des prestataires de paiement tiers',
            ],
          },
        ],
      },
    ],
    download: 'Télécharger le PDF',
    downloadSubject: 'Demande d’Accord de traitement des données (DPA)',
    contact: 'Contacter le service juridique',
    contactSubject: 'Question relative au DPA',
    lastUpdated: 'Dernière mise à jour',
    effectiveDate: 'Date d’effet',
    effectiveValue: 'À la signature de l’Accord principal',
    contactPrefix: 'Pour toute question sur le présent DPA, contactez notre Délégué à la protection des données à',
  },
} as const satisfies MarketingExactDpaCopy;

export function getMarketingExactDpaCopy(language?: string | null): MarketingExactDpaCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactDpaFr : marketingExactDpaEn;
}
