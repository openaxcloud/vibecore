import type { MetaFunction } from 'react-router';
import { AppShell, CommandPalettePreview } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Command palette - VibeCore' }];

export default function CommandPalettePage() {
  return (
    <AppShell
      title="Command palette"
      description="Keyboard-first navigation for projects, billing, support, imports and IDE actions."
    >
      <CommandPalettePreview />
    </AppShell>
  );
}
