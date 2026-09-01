import { useRef, useState } from 'react';
import { BaseChat } from './BaseChat';
import { composerHandoffScope, setPendingComposerInput, useComposerHandoffLayoutEffect } from './composer-handoff';

/**
 * Coquille affichée AVANT que la conversation existe.
 *
 * L'IDE la montre à deux titres — `ClientOnly fallback` et `Suspense fallback`
 * autour du `Chat` chargé en différé — et `Chat` s'en sert une troisième fois
 * tant que son historique charge. Dans les trois cas c'est un `BaseChat` NU :
 * le composeur y est pleinement interactif, mais il n'a ni `input` ni
 * `handleInputChange`, donc React réécrit le champ à chaque frappe
 * (`restoreControlledState`) et la valeur reste vide.
 *
 * Puis la coquille est remplacée par le vrai composant — un TYPE différent à la
 * même position, donc React démonte l'arbre et le remonte. Mesuré à 390 sur un
 * démarrage froid : le champ apparaît à +4,2 s, le vrai `Chat` arrive à +6,3 s,
 * et tout ce qui a été tapé entre les deux disparaît sans un mot.
 *
 * La coquille tient donc elle-même la frappe et la dépose dans le passe-plat,
 * que le vrai composeur reprend en arrivant.
 */
export function PendingComposerShell({
  chatStarted,
  projectIdeMode,
  projectId,
  projectUrl,
  initialIdePanels,
}: {
  chatStarted?: boolean;
  projectIdeMode?: boolean;
  projectId?: string;
  projectUrl?: string;
  initialIdePanels?: Record<string, unknown>;
}) {
  const [pendingInput, setPendingInput] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const scope = composerHandoffScope(projectId, typeof window === 'undefined' ? undefined : window.location.pathname);

  /*
   * Au démontage on relit la valeur RÉELLE du champ, pas l'état React : entre le
   * dernier rendu et le démontage, le navigateur a pu délivrer d'autres touches.
   * La lecture se fait en phase layout, dans le commit qui retire le nœud.
   */
  useComposerHandoffLayoutEffect(
    () => () => {
      const live = fieldRef.current?.value ?? '';

      if (live.length > 0) {
        setPendingComposerInput(scope, live);
      }
    },
    [scope],
  );

  return (
    <BaseChat
      textareaRef={fieldRef}
      chatStarted={chatStarted}
      projectIdeMode={projectIdeMode}
      projectId={projectId}
      projectUrl={projectUrl}
      initialIdePanels={initialIdePanels}
      input={pendingInput}
      handleInputChange={(event) => {
        const { value } = event.target;
        setPendingInput(value);
        setPendingComposerInput(scope, value);
      }}
    />
  );
}
