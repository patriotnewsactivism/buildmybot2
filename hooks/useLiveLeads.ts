import { useCallback, useEffect, useRef, useState } from 'react';
import { dbService } from '../services/dbService';
import type { Lead } from '../types';

// Live lead sync for the CRM. Background AI agents (lead-followups cron, the
// AI Team shifts) mutate leads server-side; this hook keeps the CRM view
// current without a page reload.
//
// Implementation: visibility-aware polling against the existing tenant-scoped
// leads API (no anon Supabase key in the browser, no extra dependency).
// - Pauses while the tab is hidden (no wasted requests).
// - Pauses while `holdRef` is set (drag-in-progress / modal edits), so a
//   refresh can never clobber an in-flight human interaction — the race
//   condition that made global polling unsafe in App.tsx.
// - Merges by id so object identity is preserved for unchanged rows,
//   keeping React re-renders cheap.

const POLL_INTERVAL_MS = 15_000;

export interface UseLiveLeadsResult {
  leads: Lead[];
  refresh: () => Promise<void>;
  /** Set true while the user is mid-interaction (drag, modal) to pause sync. */
  hold: (active: boolean) => void;
  lastSyncedAt: Date | null;
}

function mergeLeads(current: Lead[], incoming: Lead[]): Lead[] {
  const currentById = new Map(current.map((l) => [l.id, l]));
  return incoming.map((next) => {
    const prev = currentById.get(next.id);
    if (!prev) return next;
    // Preserve identity when nothing visible changed (cheap deep-enough check).
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  });
}

export function useLiveLeads(initialLeads: Lead[]): UseLiveLeadsResult {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const holdRef = useRef(false);
  const mountedRef = useRef(true);

  // Parent-driven updates (e.g. onUpdateLead round-trips) stay authoritative.
  useEffect(() => {
    setLeads((prev) => mergeLeads(prev, initialLeads));
  }, [initialLeads]);

  const refresh = useCallback(async () => {
    if (holdRef.current) return;
    try {
      const fresh = await dbService.getLeads();
      if (!mountedRef.current || holdRef.current) return;
      if (Array.isArray(fresh) && fresh.length >= 0) {
        setLeads((prev) => mergeLeads(prev, fresh));
        setLastSyncedAt(new Date());
      }
    } catch (err) {
      // Transient network failures must never break the CRM view.
      console.error('[useLiveLeads] refresh failed:', err);
    }
  }, []);

  const hold = useCallback((active: boolean) => {
    holdRef.current = active;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { leads, refresh, hold, lastSyncedAt };
}
