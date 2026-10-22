// This copy must be available before the remote translation catalogue loads.
const copy = {
  en: {
    title: 'This page could not finish loading',
    detail: 'Some page resources did not arrive. Check your connection and try again.',
    retry: 'Try again',
  },
  fr: {
    title: 'Le chargement de cette page a échoué',
    detail: 'Certaines ressources ne sont pas arrivées. Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
  },
  es: {
    title: 'No se pudo terminar de cargar esta página',
    detail: 'Algunos recursos no llegaron. Comprueba tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
  },
  ar: {
    title: 'تعذر إكمال تحميل هذه الصفحة',
    detail: 'لم تصل بعض الموارد. تحقق من اتصالك ثم حاول مرة أخرى.',
    retry: 'حاول مرة أخرى',
  },
};

export function StartupCatalogueRecovery({ language }: { language: keyof typeof copy }) {
  const text = copy[language];

  return (
    <section data-ecode-startup-recovery="" hidden role="alert" aria-labelledby="ecode-startup-recovery-title">
      <div>
        <h1 id="ecode-startup-recovery-title">{text.title}</h1>
        <p>{text.detail}</p>
        <button type="button">{text.retry}</button>
      </div>
    </section>
  );
}
