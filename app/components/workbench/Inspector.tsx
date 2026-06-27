import { useEffect, useRef, useState } from 'react';

interface InspectorProps {
  isActive: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onElementSelect: (elementInfo: ElementInfo) => void;
}

export interface ElementInfo {
  displayText: string;
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  styles: Record<string, string>; // Changed from CSSStyleDeclaration
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
  };
}

export const Inspector = ({ isActive, iframeRef, onElementSelect }: InspectorProps) => {
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !iframeRef.current) {
      return undefined;
    }

    const iframe = iframeRef.current;

    // Listen for messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      /*
       * Only trust messages from the inspected iframe; another frame/extension
       * could otherwise post fake inspector events or corrupt coordinates.
       */
      if (event.source !== iframe.contentWindow) {
        return;
      }

      const type = event.data?.type;

      /*
       * Translate the iframe-local rect into page coordinates without mutating
       * the shared event payload (the Preview handler reads it too).
       */
      const offsetRect = (info: any) => {
        const iframeRect = iframe.getBoundingClientRect();

        return {
          ...info,
          rect: {
            ...info.rect,
            x: info.rect.x + iframeRect.x,
            y: info.rect.y + iframeRect.y,
            top: info.rect.top + iframeRect.y,
            left: info.rect.left + iframeRect.x,
          },
        };
      };

      if (type === 'INSPECTOR_HOVER' && event.data.elementInfo?.rect) {
        setHoveredElement(offsetRect(event.data.elementInfo));
      } else if (type === 'INSPECTOR_CLICK' && event.data.elementInfo?.rect) {
        onElementSelect(offsetRect(event.data.elementInfo));
      } else if (type === 'INSPECTOR_LEAVE') {
        setHoveredElement(null);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send activation message to iframe
    const sendActivationMessage = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: 'INSPECTOR_ACTIVATE',
            active: isActive,
          },
          '*',
        );
      }
    };

    // Try to send activation message immediately and on load
    sendActivationMessage();
    iframe.addEventListener('load', sendActivationMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', sendActivationMessage);

      // Deactivate inspector in iframe
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: 'INSPECTOR_ACTIVATE',
            active: false,
          },
          '*',
        );
      }
    };
  }, [isActive, iframeRef, onElementSelect]);

  // Render overlay for hovered element
  return (
    <>
      {isActive && hoveredElement && (
        <div
          ref={overlayRef}
          className="fixed pointer-events-none z-50 border-2 border-blue-500 bg-blue-500/10"
          style={{
            left: hoveredElement.rect.x,
            top: hoveredElement.rect.y,
            width: hoveredElement.rect.width,
            height: hoveredElement.rect.height,
          }}
        >
          {/* Element info tooltip — flips below the element when there's no room above (near viewport top). */}
          <div
            className={`absolute ${hoveredElement.rect.y < 32 ? 'top-full mt-1' : '-top-8'} left-0 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor text-xs px-2 py-1 rounded whitespace-nowrap`}
          >
            {hoveredElement.tagName.toLowerCase()}
            {hoveredElement.id && `#${hoveredElement.id}`}
            {hoveredElement.className && `.${hoveredElement.className.split(' ')[0]}`}
          </div>
        </div>
      )}
    </>
  );
};
