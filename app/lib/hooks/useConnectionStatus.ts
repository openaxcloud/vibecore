import { useState, useEffect, useRef } from 'react';
import { checkConnection } from '~/lib/api/connection';

const ACKNOWLEDGED_CONNECTION_ISSUE_KEY = 'bolt_acknowledged_connection_issue';

type ConnectionIssueType = 'disconnected' | 'high-latency' | null;

const getAcknowledgedIssue = (): string | null => {
  try {
    return localStorage.getItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
  } catch {
    return null;
  }
};

export const useConnectionStatus = () => {
  const [hasConnectionIssues, setHasConnectionIssues] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<ConnectionIssueType>(null);
  const [acknowledgedIssue, setAcknowledgedIssue] = useState<string | null>(() => getAcknowledgedIssue());
  const mountedRef = useRef(true);

  const checkStatus = async () => {
    try {
      const status = await checkConnection();

      if (!mountedRef.current) {
        return;
      }

      const issue = !status.connected ? 'disconnected' : status.latency > 1000 ? 'high-latency' : null;

      setCurrentIssue(issue);

      // Only show issues if they're new or different from the acknowledged one
      setHasConnectionIssues(issue !== null && issue !== acknowledgedIssue);
    } catch (error) {
      console.error('Failed to check connection:', error);

      if (!mountedRef.current) {
        return;
      }

      // Show connection issues if we can't even check the status
      setCurrentIssue('disconnected');
      setHasConnectionIssues(true);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Check immediately and then every 10 seconds
    checkStatus();

    const interval = setInterval(checkStatus, 10 * 1000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [acknowledgedIssue]);

  const acknowledgeIssue = () => {
    try {
      if (currentIssue) {
        localStorage.setItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY, currentIssue);
      }
    } catch {
      // localStorage may be unavailable (private mode / quota); acknowledgement is best-effort.
    }

    setAcknowledgedIssue(currentIssue);
    setHasConnectionIssues(false);
  };

  const resetAcknowledgment = () => {
    try {
      localStorage.removeItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
    } catch {
      // Ignore storage failures; in-memory state below is authoritative.
    }

    setAcknowledgedIssue(null);
    checkStatus();
  };

  return { hasConnectionIssues, currentIssue, acknowledgeIssue, resetAcknowledgment };
};
