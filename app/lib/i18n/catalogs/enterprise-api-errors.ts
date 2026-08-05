type EnterpriseApiErrorCopy = Readonly<{
  requestFailed: string;
  organizationMissing: string;
  projectMissing: string;
  unsupportedAction: string;
}>;

const ENTERPRISE_API_ERROR_COPY: Readonly<Record<'en' | 'fr', EnterpriseApiErrorCopy>> = {
  en: {
    requestFailed: 'The request could not be completed. Please try again.',
    organizationMissing: 'No organization was found for your account.',
    projectMissing: 'The project was not found.',
    unsupportedAction: 'This action is not supported.',
  },
  fr: {
    requestFailed: 'La requête n’a pas pu aboutir. Veuillez réessayer.',
    organizationMissing: 'Aucune organisation n’a été trouvée pour votre compte.',
    projectMissing: 'Le projet est introuvable.',
    unsupportedAction: 'Cette action n’est pas prise en charge.',
  },
};

export function getEnterpriseApiErrorCopy(language?: string | null): EnterpriseApiErrorCopy {
  return language?.toLowerCase().startsWith('fr') ? ENTERPRISE_API_ERROR_COPY.fr : ENTERPRISE_API_ERROR_COPY.en;
}
