import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { ControlPanel } from '~/components/settings/ControlPanel';
import { useState } from 'react';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = () => json({});

export default function Index() {
  const [showControlPanel, setShowControlPanel] = useState(false);

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <button
        onClick={() => setShowControlPanel(true)}
        className="fixed bottom-4 right-4 flex items-center space-x-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
      >
        <span className="i-ph:gear w-5 h-5" />
        <span>Open Control Panel</span>
      </button>
      <ClientOnly>
        {() => <ControlPanel open={showControlPanel} onClose={() => setShowControlPanel(false)} />}
      </ClientOnly>
    </div>
  );
}
