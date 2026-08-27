/**
 * French translation bundle. Sprint 7 / Phase 0 #7.
 *
 * Mirror the English keys exactly. Untranslated keys fall back to the
 * English seed automatically via `t()`.
 */

import type { TranslationBundle } from '~/lib/i18n/dictionary';

export const fr: TranslationBundle = {
  // Locale et chrome global de l'application
  'common.unavailable': 'Indisponible',
  'locale.switchLabel': "Choisir la langue d'affichage",
  'locale.current': 'Langue actuelle : {language}',
  'locale.automatic': 'Automatique (langue du navigateur)',
  'locale.english': 'Anglais',
  'locale.french': 'Français',
  'root.loadingEcode': 'Chargement d’E-Code',
  'root.loadingIde': 'Chargement de l’IDE E-Code',
  'root.loadingPage': 'Chargement de la page',
  'root.dismissNotification': 'Fermer la notification',
  'root.errorLabel': 'Erreur {status}',
  'root.notFoundTitle': 'Cette page est introuvable',
  'root.errorTitle': 'Une erreur est survenue',
  'root.notFoundBody': 'La page recherchée a peut-être été déplacée, renommée ou n’a jamais existé.',
  'root.errorBody': 'Une erreur inattendue a interrompu cette page. Réessayez ou revenez à une page connue.',
  'root.backHome': 'Retour à l’accueil',
  'root.goDashboard': 'Accéder au tableau de bord',
  'root.visitHelp': 'Consulter le centre d’aide',
  'root.metaTitle': 'E-Code — Plateforme de développement d’applications par IA',
  'root.metaDescription': 'Créez, testez et déployez des applications de production avec les agents IA E-Code.',
  'errors.methodNotAllowed': 'Méthode non autorisée',

  // Structure d’authentification et vocabulaire commun des formulaires
  'auth.shell.enterpriseSecurity': 'Sécurité de niveau entreprise',
  'auth.shell.heroTitle': 'Créez des applications de production avec E-Code',
  'auth.shell.heroBody':
    'Provisionnez des espaces de travail, partagez des aperçus en direct et déployez sur votre propre infrastructure depuis un seul onglet.',
  'auth.shell.backToSignIn': 'Retour à la connexion',
  'auth.shell.brandName': 'E-Code',
  'auth.shell.brandSubtitle': 'Espace de travail de développement assisté par IA',
  'auth.shell.capsLock': 'Le verrouillage des majuscules est activé',
  'auth.common.email': 'Adresse e-mail',
  'auth.common.workEmail': 'Adresse e-mail professionnelle',
  'auth.common.fullName': 'Nom complet',
  'auth.common.password': 'Mot de passe',
  'auth.common.newPassword': 'Nouveau mot de passe',
  'auth.common.confirmPassword': 'Confirmer le mot de passe',
  'auth.common.confirmNewPassword': 'Confirmer le nouveau mot de passe',
  'auth.common.organizationName': 'Nom de l’organisation',
  'auth.common.resetToken': 'Jeton de réinitialisation',
  'auth.common.verificationToken': 'Jeton de vérification',
  'auth.common.emailPlaceholder': 'vous@entreprise.fr',
  'auth.common.fullNamePlaceholder': 'Ada Lovelace',
  'auth.common.organizationPlaceholder': 'Acme Inc.',
  'auth.common.passwordPlaceholder': 'Saisissez votre mot de passe',
  'auth.common.passwordMinCharacters': 'Au moins {count} caractères',
  'auth.common.samePasswordPlaceholder': 'Saisissez à nouveau le même mot de passe',
  'auth.common.resetTokenPlaceholder': 'reset_...',
  'auth.common.verificationTokenPlaceholder': 'verify_...',
  'auth.common.showPassword': 'Afficher le mot de passe',
  'auth.common.hidePassword': 'Masquer le mot de passe',
  'common.showSubject': 'Afficher {subject}',
  'common.hideSubject': 'Masquer {subject}',
  'auth.common.backHome': 'Retour à l’accueil',
  'auth.common.terms': 'Conditions d’utilisation',
  'auth.common.privacyPolicy': 'Politique de confidentialité',
  'auth.common.and': 'et',
  'auth.passwordStrength.label': 'Robustesse du mot de passe',
  'auth.passwordStrength.empty': 'Vide',
  'auth.passwordStrength.weak': 'Faible',
  'auth.passwordStrength.fair': 'Moyen',
  'auth.passwordStrength.good': 'Bon',
  'auth.passwordStrength.strong': 'Robuste',
  'auth.passwordStrength.minimumRequired': 'Au moins {count} caractères (obligatoire)',
  'auth.passwordStrength.recommendedLength': '{count} caractères ou plus',
  'auth.passwordStrength.number': 'Au moins un chiffre',
  'auth.passwordStrength.symbol': 'Au moins un symbole',
  'auth.passwordStrength.met': ' — critère rempli',
  'auth.passwordStrength.notMet': ' — critère non rempli',

  // Connexion et fournisseurs d’identité
  'auth.login.metaTitle': 'Connexion - E-Code',
  'auth.login.metaDescription': 'Connectez-vous à votre espace de travail E-Code.',
  'auth.login.eyebrow': 'Accès sécurisé à votre espace de travail',
  'auth.login.title': 'Ravi de vous revoir',
  'auth.login.description':
    'Connectez-vous pour continuer à créer, prévisualiser et déployer des applications de production avec l’IDE E-Code.',
  'auth.login.heroEyebrow': 'Développement assisté par IA',
  'auth.login.heroTitle': 'Créez plus vite dans votre espace de travail E-Code',
  'auth.login.heroBody':
    'Livrez des applications prêtes pour la production grâce à un agent IA, aux aperçus en direct, aux espaces de travail sécurisés et aux processus de déploiement.',
  'auth.login.featureSecurity': 'Authentification SaaS et accès aux espaces de travail sécurisés',
  'auth.login.featureAgent': 'Un agent IA crée des applications complètes à partir de vos instructions',
  'auth.login.featureIde': 'Un IDE réunissant fichiers, terminal, aperçu et déploiements',
  'auth.login.featureProduction': 'Des parcours de production pour les équipes, l’administration et la facturation',
  'auth.login.statProviders': 'Fournisseurs d’IA',
  'auth.login.statLanguages': 'Langages',
  'auth.login.statUptime': 'Objectif de disponibilité',
  'auth.login.statControls': 'Contrôles prêts à l’emploi',
  'auth.login.footerPrompt': 'Vous n’avez pas de compte ?',
  'auth.login.registerFree': 'Inscrivez-vous gratuitement',
  'auth.login.legalPrefix': 'En vous connectant, vous acceptez nos',
  'auth.login.forgotPassword': 'Mot de passe oublié ?',
  'auth.login.mfaLabel': 'Code MFA requis',
  'auth.login.mfaPlaceholder': '123456 ou code de récupération',
  'auth.login.mfaHint':
    'Saisissez le code de votre application d’authentification ou l’un de vos codes de récupération à usage unique.',
  'auth.login.remember': 'Se souvenir de moi pendant 30 jours',
  'auth.login.submit': 'Se connecter',
  'auth.login.submitting': 'Connexion…',
  'auth.login.github': 'Continuer avec GitHub',
  'auth.login.google': 'Continuer avec Google',
  'auth.oauth.identityProvider': 'Fournisseur d’identité',
  'auth.oauth.accessDenied': 'La connexion avec {provider} a été annulée ou refusée.',
  'auth.oauth.invalidCallback': 'La connexion avec {provider} a expiré. Recommencez.',
  'auth.oauth.unavailable': '{provider} est temporairement indisponible. Réessayez dans quelques instants.',
  'auth.oauth.unsupported': 'La connexion avec {provider} n’est pas prise en charge.',
  'auth.oauth.callbackFailed': 'La connexion avec {provider} n’a pas pu aboutir. Réessayez.',
  'auth.oauth.apiUnavailable':
    'La connexion avec {provider} ne peut pas joindre le service d’authentification. Réessayez dans quelques instants.',
  'auth.oauth.invalidResponse': '{provider} a renvoyé une réponse de connexion invalide. Réessayez.',
  'auth.oauth.generic': 'La connexion avec {provider} n’a pas pu aboutir. Réessayez.',

  // Inscription
  'auth.signup.metaTitle': 'Créer un compte - E-Code',
  'auth.signup.metaDescription': 'Créez votre compte E-Code et commencez à développer des applications de production.',
  'auth.signup.eyebrow': 'Commencez gratuitement',
  'auth.signup.title': 'Créez votre compte',
  'auth.signup.description':
    'Lancez votre premier espace de travail, invitez votre équipe et commencez à livrer avec l’agent IA en quelques minutes.',
  'auth.signup.heroEyebrow': 'Commencez gratuitement, évoluez à la demande',
  'auth.signup.heroTitle': 'Créez des applications de production avec un copilote IA',
  'auth.signup.heroBody':
    'Provisionnez un espace de travail, partagez des aperçus en direct et déployez sur votre propre infrastructure, depuis un seul onglet.',
  'auth.signup.featureSecurity': 'Contrôles prêts pour SOC 2, MFA et journaux d’audit intégrés',
  'auth.signup.featureAgent': 'Un agent IA qui écrit, révise et livre le code avec vous',
  'auth.signup.featureIde': 'Un IDE cloud avec terminal, aperçu et processus Git natifs',
  'auth.signup.featureProviders': 'Utilisez vos propres clés auprès de 21 fournisseurs d’IA',
  'auth.signup.statProviders': 'Fournisseurs d’IA',
  'auth.signup.statLanguages': 'Langages',
  'auth.signup.footerPrompt': 'Vous avez déjà un compte ?',
  'auth.signup.signIn': 'Connectez-vous',
  'auth.signup.legalPrefix': 'En créant un compte, vous acceptez nos',
  'auth.signup.organizationHint':
    'Laissez ce champ vide pour créer un espace de travail personnel ; vous pourrez le renommer plus tard dans les paramètres.',
  'auth.signup.addOrganization': '+ Ajouter un nom d’organisation (facultatif)',
  'auth.signup.submit': 'Créer le compte',
  'auth.signup.submitting': 'Création du compte…',
  'auth.signup.github': 'S’inscrire avec GitHub',
  'auth.signup.google': 'S’inscrire avec Google',

  // Récupération du mot de passe et vérification de l’adresse e-mail
  'auth.forgot.metaTitle': 'Mot de passe oublié - E-Code',
  'auth.forgot.metaDescription': 'Demandez un lien sécurisé pour réinitialiser le mot de passe de votre compte E-Code.',
  'auth.forgot.eyebrow': 'Réinitialisez votre mot de passe',
  'auth.forgot.title': 'Mot de passe oublié ?',
  'auth.forgot.description':
    'Saisissez l’adresse e-mail de votre compte ; nous vous enverrons un lien de réinitialisation à durée limitée.',
  'auth.forgot.heroEyebrow': 'Récupération sécurisée',
  'auth.forgot.heroTitle': 'Votre mot de passe n’est jamais stocké en clair',
  'auth.forgot.heroBody':
    'Les liens de réinitialisation expirent après 30 minutes et les sessions existantes sont révoquées dès que vous choisissez un nouveau mot de passe.',
  'auth.forgot.footerPrompt': 'Vous vous en souvenez ?',
  'auth.forgot.backToSignIn': 'Retour à la connexion',
  'auth.forgot.submit': 'Envoyer le lien de réinitialisation',
  'auth.forgot.submitting': 'Envoi…',
  'auth.reset.metaTitle': 'Réinitialiser le mot de passe - E-Code',
  'auth.reset.metaDescription': 'Choisissez un nouveau mot de passe pour votre compte E-Code.',
  'auth.reset.eyebrow': 'Choisissez un nouveau mot de passe',
  'auth.reset.title': 'Réinitialisez votre mot de passe',
  'auth.reset.description':
    'Choisissez un nouveau mot de passe ; toutes vos sessions existantes seront déconnectées dès son enregistrement.',
  'auth.reset.heroEyebrow': 'Récupération sécurisée',
  'auth.reset.heroTitle': 'Un mot de passe robuste protège votre espace de travail',
  'auth.reset.heroBody':
    'Chaque mot de passe est haché avec scrypt et un sel unique, sans jamais être journalisé. Vos anciennes sessions sont révoquées dès la validation.',
  'auth.reset.footerPrompt': 'C’est fait ?',
  'auth.reset.signInNewPassword': 'Connectez-vous avec votre nouveau mot de passe',
  'auth.reset.submit': 'Réinitialiser le mot de passe',
  'auth.reset.submitting': 'Réinitialisation…',
  'auth.verify.metaTitle': 'Vérifier l’adresse e-mail - E-Code',
  'auth.verify.metaDescription': 'Vérifiez l’adresse e-mail associée à votre compte E-Code.',
  'auth.verify.eyebrow': 'Vérifiez votre adresse e-mail',
  'auth.verify.title': 'Confirmez votre adresse e-mail',
  'auth.verify.description': 'Collez le jeton reçu par e-mail ou ouvrez directement le lien de vérification.',
  'auth.verify.heroEyebrow': 'Une dernière étape',
  'auth.verify.heroTitle': 'Débloquez toutes les fonctions de votre espace de travail',
  'auth.verify.heroBody':
    'La vérification de votre adresse e-mail active les invitations d’équipe, les notifications de déploiement et les reçus de facturation.',
  'auth.verify.footerPrefix': 'Vous n’avez pas reçu l’e-mail ? Utilisez',
  'auth.verify.footerResend': 'Renvoyer l’e-mail de vérification',
  'auth.verify.footerMiddle': 'ci-dessus, ou',
  'auth.verify.footerSignIn': 'connectez-vous',
  'auth.verify.footerSuffix': 'depuis un autre appareil.',
  'auth.verify.tokenHint': 'Le jeton expire 24 heures après l’inscription.',
  'auth.verify.submit': 'Vérifier l’adresse e-mail',
  'auth.verify.submitting': 'Vérification…',
  'auth.verify.resend': 'Renvoyer l’e-mail de vérification',
  'auth.verify.resendAvailable': 'Nouvel envoi disponible dans {count} secondes',
  'auth.verify.resendAvailable_one': 'Nouvel envoi disponible dans {count} seconde',
  'auth.verify.resendAvailable_other': 'Nouvel envoi disponible dans {count} secondes',

  // Retours d’authentification stables et localisés (le texte brut de l’API n’est jamais affiché)
  'auth.feedback.invalidCredentials': 'L’adresse e-mail ou le mot de passe est incorrect.',
  'auth.feedback.suspended': 'Ce compte est suspendu. Contactez l’assistance si vous pensez qu’il s’agit d’une erreur.',
  'auth.feedback.mfaRequired': 'Saisissez votre code MFA pour terminer la connexion.',
  'auth.feedback.invalidMfa': 'Le code MFA ou de récupération est invalide. Réessayez.',
  'auth.feedback.ssoEnforced': 'Votre organisation exige une connexion SSO. Utilisez votre fournisseur d’identité.',
  'auth.feedback.rateLimitedSeconds': 'Trop de tentatives — réessayez dans {count} secondes.',
  'auth.feedback.rateLimitedSeconds_one': 'Trop de tentatives — réessayez dans {count} seconde.',
  'auth.feedback.rateLimitedSeconds_other': 'Trop de tentatives — réessayez dans {count} secondes.',
  'auth.feedback.rateLimitedMinutes': 'Trop de tentatives — réessayez dans {count} minutes.',
  'auth.feedback.rateLimitedMinutes_one': 'Trop de tentatives — réessayez dans {count} minute.',
  'auth.feedback.rateLimitedMinutes_other': 'Trop de tentatives — réessayez dans {count} minutes.',
  'auth.feedback.rateLimitedDefault': 'Trop de tentatives — réessayez dans une minute.',
  'auth.feedback.loginFailed': 'La connexion a échoué. Vérifiez vos informations et réessayez.',
  'auth.feedback.loginUnavailable': 'La connexion est temporairement indisponible. Réessayez dans quelques instants.',
  'auth.feedback.emailRequired': 'L’adresse e-mail est obligatoire.',
  'auth.feedback.passwordTooShort': 'Le mot de passe doit contenir au moins {count} caractères.',
  'auth.feedback.passwordsMismatch': 'Les mots de passe ne correspondent pas.',
  'auth.feedback.emailExists':
    'Un compte associé à cette adresse e-mail existe déjà. Essayez plutôt de vous connecter.',
  'auth.feedback.signupFailed': 'Impossible de créer votre compte. Vérifiez vos informations et réessayez.',
  'auth.feedback.signupUnavailable':
    'La création de compte est temporairement indisponible. Réessayez dans quelques instants.',
  'auth.feedback.resetRequested':
    'Si un compte correspond à cette adresse e-mail, nous venons d’envoyer les instructions de réinitialisation.',
  'auth.feedback.resetRequestFailed': 'Impossible de lancer la réinitialisation du mot de passe. Réessayez.',
  'auth.feedback.resetRequestUnavailable':
    'La réinitialisation du mot de passe est temporairement indisponible. Réessayez dans quelques instants.',
  'auth.feedback.resetComplete':
    'Votre mot de passe a été réinitialisé et vos sessions existantes ont été révoquées. Vous pouvez maintenant vous connecter.',
  'auth.feedback.invalidResetToken': 'Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.',
  'auth.feedback.resetFailed': 'Impossible de réinitialiser votre mot de passe. Demandez un nouveau lien ou réessayez.',
  'auth.feedback.resetUnavailable':
    'La réinitialisation du mot de passe est temporairement indisponible. Réessayez dans quelques instants.',
  'auth.feedback.emailAlreadyVerified':
    'Cette adresse e-mail est déjà vérifiée ; vous pouvez continuer à utiliser E-Code.',
  'auth.feedback.verificationSentDev':
    'Un nouvel e-mail de vérification a été envoyé. Jeton de développement : {token}',
  'auth.feedback.verificationSent':
    'Un nouvel e-mail de vérification est en route. Vérifiez votre boîte de réception et vos courriers indésirables.',
  'auth.feedback.emailVerified':
    'Adresse e-mail vérifiée. Vous pouvez fermer cet onglet et continuer à utiliser E-Code.',
  'auth.feedback.invalidVerificationToken': 'Ce lien de vérification est invalide ou a expiré. Demandez-en un nouveau.',
  'auth.feedback.verificationFailed': 'La vérification a échoué. Contrôlez le jeton ou demandez un nouvel e-mail.',
  'auth.feedback.verificationUnavailable':
    'La vérification de l’adresse e-mail est temporairement indisponible. Réessayez dans quelques instants.',

  // Patch review panel
  'patchReview.title': 'Fichiers modifiés',
  'patchReview.filesCount': '{count} fichiers',
  'patchReview.aggregateAriaLabel': '{added} ajoutées, {removed} supprimées sur {files} fichiers',
  'patchReview.applyAll': 'Tout appliquer ({count})',
  'patchReview.applying': 'Application…',
  'patchReview.noChanges': 'Contenu identique au fichier sur disque.',
  'patchReview.streaming': 'Patch en cours de stream…',

  // File mentions palette
  'mentions.empty': 'Aucun fichier correspondant',

  // Slash commands palette
  'slashCommands.empty': 'Aucune commande correspondante',

  // Plan checklist
  'plan.progressLabel': '{completed} / {total} terminées',
  'plan.progressLabelWithFailed': '{completed} / {total} terminées · {failed} échouées',
  'plan.statusPending': 'En attente',
  'plan.statusInProgress': 'En cours',
  'plan.statusCompleted': 'Terminé',
  'plan.statusFailed': 'Échec',

  // Conversation branches dropdown
  'branches.ariaLabel': 'Branches de conversation ({count})',
  'branches.trigger.title': 'Parcourir les branches de conversation',
  'branches.row.switch': 'Basculer vers {label}',
  'branches.row.rename': 'Renommer {label}',
  'branches.row.delete': 'Supprimer {label}',
  'branches.row.deleteTitle': 'Supprimer la branche (et ses descendantes)',
  'branches.row.renameTitle': 'Renommer la branche',
  'branches.switchedToast': 'Conversation changée',
  'branches.switchFailedToast': 'Impossible de basculer — conversation manquante',
  'branches.renamePrompt': 'Renommer la branche',
  'branches.renameLabel': 'Titre de la branche',
  'branches.renameAction': 'Renommer',
  'branches.emptyTitleToast': 'Le titre ne peut pas être vide',
  'branches.renameFailedToast': 'Impossible de renommer la branche. Réessayez.',
  'branches.deleteConfirm': 'Supprimer cette branche et ses sous-branches ?',
  'branches.deleteDescription':
    'La branche et toutes ses sous-branches seront supprimées. Cette action est irréversible.',
  'branches.deleteAction': 'Supprimer la branche',
  'branches.deletedToast': 'Branche supprimée',
  'branches.deleteFailedToast': 'Impossible de supprimer la branche. Vos modifications n’ont pas été enregistrées.',

  // Share view
  'share.fallbackTitle': 'Conversation partagée',
  'share.metaPrefix': 'Partagée depuis le projet',
  'share.disclaimer': 'Instantané en lecture seule de la conversation. {count} message{plural} dans le lot.',
  'share.errorTitle': 'Lien de partage indisponible',
  'share.errorDefault': "Le contenu du lien n'a pas pu être décodé.",
  'share.forkButton': 'Dupliquer cette conversation (connexion requise)',

  // Presence avatars
  'presence.viewersAriaLabel': '{count} observateurs',
  'presence.overflowAriaLabel': '{count} observateurs supplémentaires',
  'presence.statusTyping': 'en train de taper',
  'presence.statusViewing': 'regarde',
  'presence.statusIdle': 'inactif',

  // Share button
  'shareButton.label': 'Partager cette conversation',
  'shareButton.disabled': 'Envoie au moins un message avant de partager',
  'shareButton.enabled': 'Copier un lien de partage de cette conversation',
  'shareButton.copiedToast': 'Lien de partage copié dans le presse-papier',
  'shareButton.errorCouldNotBuild': 'Impossible de créer le lien de partage',
  'shareButton.errorClipboard': 'Lien construit mais la copie a échoué',
};
