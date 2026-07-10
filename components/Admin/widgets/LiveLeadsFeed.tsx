import { TrendingUp } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../../services/apiConfig';
import { Panel } from '../../UI/Panel';

interface LiveLead {
  id: string;
  researched_by: string;
  company_name: string;
  industry: string;
  city: string;
  website?: string;
  created_at: string;
}

interface LiveLeadsResponse {
  date: string;
  total_today: number;
  leads: LiveLead[];
}

const POLL_MS = 4000;

export const LiveLeadsFeed: React.FC = () => {
  const [data, setData] = useState<LiveLeadsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(buildApiUrl('/admin/live-leads'), {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LiveLeadsResponse = await res.json();
        if (cancelled) return;

        // Figure out which rows are brand new since the last poll so we can
        // flash them -- but never flash on the very first load (that would
        // flash the entire existing list).
        const newlySeen = new Set<string>();
        for (const lead of json.leads) {
          if (!isFirstLoad.current && !knownIds.current.has(lead.id)) {
            newlySeen.add(lead.id);
          }
          knownIds.current.add(lead.id);
        }
        isFirstLoad.current = false;

        setData(json);
        setError(null);
        if (newlySeen.size > 0) {
          setFlashIds(newlySeen);
          setTimeout(() => setFlashIds(new Set()), 2200);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const timeAgo = (iso: string) => {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <Panel
      title="Live Leads Feed"
      eyebrow="AI Team"
      right={
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] text-console-muted">LIVE</span>
        </div>
      }
    >
      <div className="flex items-center justify-between border-b border-console-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-console-muted">Researched today</span>
        </div>
        <span className="text-2xl font-bold text-console-text tabular-nums">
          {data?.total_today ?? '—'}
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-400">
          Couldn't load live feed: {error}
        </div>
      )}

      <div className="max-h-96 overflow-y-auto">
        {data?.leads.length === 0 && !error && (
          <div className="px-4 py-6 text-center text-xs text-console-muted">
            No leads researched yet today — the team runs every few hours.
          </div>
        )}
        {data?.leads.map((lead) => (
          <div
            key={lead.id}
            className={`flex items-center justify-between border-b border-console-border/20 px-4 py-2.5 transition-colors duration-1000 ${
              flashIds.has(lead.id) ? 'bg-emerald-500/10' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-console-text">{lead.company_name}</div>
              <div className="truncate text-[11px] text-console-muted">
                {lead.industry} · {lead.city}
              </div>
            </div>
            <div className="ml-3 shrink-0 text-right">
              <div className="text-[11px] text-emerald-400">{lead.researched_by}</div>
              <div className="text-[10px] text-console-muted">{timeAgo(lead.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default LiveLeadsFeed;
