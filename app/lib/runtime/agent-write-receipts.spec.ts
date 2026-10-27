import { beforeEach, describe, expect, it } from 'vitest';
import {
  arbitreDe,
  cheminsAttribuesParLesLanes,
  cheminsEcritsParLesLanes,
  confirmationsEcritureVersion,
  confirmationCouranteDuChemin,
  confirmerEcritureDeMessage,
  invaliderConfirmationDeMessage,
  observerEcrituresDeMessage,
  reinitialiserConfirmationsEcriture,
} from './agent-lane-writes';

beforeEach(() => reinitialiserConfirmationsEcriture());

describe('runtime proposal receipts are separate from arbitration', () => {
  it('does not count authorization, open/truncated actions or refused writes as persisted', () => {
    observerEcrituresDeMessage('turn');

    const arbiter = arbitreDe('turn');
    expect(arbiter.peutEcrire('docs/ARCHITECTURE.md', 0).autorisee).toBe(true);
    expect(arbiter.peutEcrire('docs/ARCHITECTURE.md', 2).autorisee).toBe(false);
    expect(cheminsAttribuesParLesLanes('turn')).toEqual(['docs/architecture.md']);
    expect(cheminsEcritsParLesLanes('turn')).toEqual([]);
  });

  it('combines confirmed lane and coordinator proposals under the parent turn', () => {
    confirmerEcritureDeMessage('turn::lane:frontend', './src/Card.tsx', 'frontend-proposal');
    confirmerEcritureDeMessage('turn', 'docs/ARCHITECTURE.md', 'coordinator-proposal');
    expect(cheminsEcritsParLesLanes('turn')).toEqual(['src/Card.tsx', 'docs/ARCHITECTURE.md']);
  });

  it('notifies subscribers for every confirmed write, including reacceptance', () => {
    observerEcrituresDeMessage('turn');

    const before = confirmationsEcritureVersion.get();
    confirmerEcritureDeMessage('turn', 'a.ts', 'proposal');
    expect(confirmationsEcritureVersion.get()).toBe(before + 1);
    confirmerEcritureDeMessage('turn', './a.ts', 'proposal');
    expect(confirmationsEcritureVersion.get()).toBe(before + 2);
    invaliderConfirmationDeMessage('turn', 'a.ts', 'proposal');
    expect(confirmationsEcritureVersion.get()).toBe(before + 3);
    expect(cheminsEcritsParLesLanes('turn')).toEqual([]);
  });

  it('an old reverted proposal does not invalidate a newer confirmed proposal', () => {
    confirmerEcritureDeMessage('turn::lane:frontend', 'a.ts', 'old');
    confirmerEcritureDeMessage('turn', 'a.ts', 'new');
    invaliderConfirmationDeMessage('turn::lane:frontend', 'a.ts', 'old');
    expect(cheminsEcritsParLesLanes('turn')).toEqual(['a.ts']);
  });

  it('keeps history unknown after reset even if an old arbiter survives', () => {
    arbitreDe('history').peutEcrire('a.ts', 0);
    confirmerEcritureDeMessage('history', 'a.ts', 'proposal');
    reinitialiserConfirmationsEcriture();
    expect(cheminsAttribuesParLesLanes('history')).toEqual(['a.ts']);
    expect(cheminsEcritsParLesLanes('history')).toBeUndefined();
    expect(cheminsEcritsParLesLanes('unobserved')).toBeUndefined();
  });

  it('orders latest receipts across turns even when proposal identities repeat', () => {
    confirmerEcritureDeMessage('a::lane:frontend', 'same.ts', 'same-id');
    confirmerEcritureDeMessage('b', 'same.ts', 'same-id');
    expect(confirmationCouranteDuChemin('same.ts')).toEqual({ messageId: 'b', receiptId: 'same-id' });
    confirmerEcritureDeMessage('a', 'same.ts', 'same-id');
    expect(confirmationCouranteDuChemin('same.ts')).toEqual({ messageId: 'a', receiptId: 'same-id' });
    reinitialiserConfirmationsEcriture();
    expect(confirmationCouranteDuChemin('same.ts')).toBeUndefined();
  });

  it('keeps case-distinct runtime paths and their invalidations independent', () => {
    confirmerEcritureDeMessage('turn', 'src/App.tsx', 'upper');
    confirmerEcritureDeMessage('turn', 'src/app.tsx', 'lower');
    expect(cheminsEcritsParLesLanes('turn')).toEqual(['src/App.tsx', 'src/app.tsx']);
    invaliderConfirmationDeMessage('turn', 'src/App.tsx', 'upper');
    expect(cheminsEcritsParLesLanes('turn')).toEqual(['src/app.tsx']);
  });

  it('bounds observations to 32 turns and evicts to unknown rather than zero', () => {
    for (let i = 0; i < 33; i++) {
      observerEcrituresDeMessage(`bounded-${i}`);
    }
    expect(cheminsEcritsParLesLanes('bounded-0')).toBeUndefined();
    expect(cheminsEcritsParLesLanes('bounded-1')).toEqual([]);
    expect(cheminsEcritsParLesLanes('bounded-32')).toEqual([]);
  });
});
