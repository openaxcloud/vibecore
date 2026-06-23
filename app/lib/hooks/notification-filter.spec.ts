import { describe, it, expect } from 'vitest';
import { isActionableNotification } from '~/lib/hooks/notification-filter';

describe('isActionableNotification', () => {
  it('treats routine info notifications (e.g. successful API calls) as not actionable', () => {
    expect(isActionableNotification({ type: 'info', details: { statusCode: 200 } })).toBe(false);
  });

  it('treats success notifications as not actionable', () => {
    expect(isActionableNotification({ type: 'success', details: {} })).toBe(false);
  });

  it('treats error notifications as actionable', () => {
    expect(isActionableNotification({ type: 'error', details: {} })).toBe(true);
  });

  it('treats warning notifications as actionable', () => {
    expect(isActionableNotification({ type: 'warning' })).toBe(true);
  });

  it('treats update notifications as actionable regardless of level', () => {
    expect(isActionableNotification({ type: 'info', details: { type: 'update' } })).toBe(true);
  });

  it('handles missing details', () => {
    expect(isActionableNotification({ type: 'info' })).toBe(false);
  });
});
