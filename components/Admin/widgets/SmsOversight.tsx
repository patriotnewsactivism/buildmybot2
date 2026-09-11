import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  MessageSquareText,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

/**
 * Platform-admin oversight for SMS (Telnyx 10DLC).
 *
 * Staff previously had no view of this at all: SMS is the only product area
 * whose tables are keyed by `tenant_key` rather than the owner columns the
 * rest of the admin dashboard filters on, so none of the existing admin pages
 * could show it and the admin sidebar had no SMS entry. A tenant stuck in
 * carrier registration, or one whose sends had quietly stopped at a spend
 * limit, was invisible until they emailed support.
 *
 * Read-only by design -- see the header note in api/sms/oversight.ts. The
 * value here is triage: the backend sorts blocked tenants above waiting ones
 * above healthy ones, so the top of the table is always the work.
 */

type AttentionLevel = 'blocked' | 'waiting' | 'ok';

const JOB_STATUSES = [
  'queued',
  'leased',
  'sending',
  'accepted',
  'delivered',
  'delivery_failed',
  'cancelled',
  'unknown',
] as const;

type JobStatus = (typeof JOB_STATUSES)[number];

interface OversightTenant {
  tenantKey: string;
  businessName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  plan: string | null;
  paid: boolean;
  paidUntil: string | null;
  ready: boolean;
  sender: string | null;
  campaignId: string | null;
  campaignUsecase: string | null;
  registrationStatus: string;
  registrationStep: string | null;
  registrationError: string | null;
  includedSegments: number;
  usedSegments: number;
  overageUsd: number;
  spendLimitUsd: number;
  budgetExhausted: boolean;
  jobs: Record<JobStatus, number>;
  attention: AttentionLevel;
  reason: string | null;
  updatedAt: string | null;
}

interface OversightState {
  tenants: OversightTenant[];
  totals: {
    tenants: number;
    ready: number;
    blocked: number;
    waiting: number;
    unregistered: number;
    overageUsd: number;
    jobs: Record<JobStatus, number>;
  };
  launchEnabled: boolean;
  jobsTruncated: boolean;
  /** True when the 500-tenant page cap bound; registration state may be partial. */
  tenantsTruncated: boolean;
  windowDays: number;
}

type Filter = 'all' | 'blocked' | 'waiting' | 'live';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All tenants' },
  { key: 'blocked', label: 'Needs attention' },
  { key: 'waiting', label: 'Awaiting carrier' },
  { key: 'live', label: 'Live senders' },
];

/** Carrier/provisioning status → what a human should read. */
const STATUS_LABELS: Record<string, string> = {
  not_registered: 'Not started',
  new: 'Submitted',
  pending: 'With carrier',
  working: 'In progress',
  waiting_funding: 'Needs funding',
  unknown: 'Needs reconciliation',
  ready: 'Approved',
};

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-green-100 text-green-800',
  pending: 'bg-blue-100 text-blue-800',
  working: 'bg-blue-100 text-blue-800',
  new: 'bg-blue-100 text-blue-800',
  waiting_funding: 'bg-red-100 text-red-800',
  unknown: 'bg-red-100 text-red-800',
  not_registered: 'bg-slate-100 text-slate-600',
};

const ATTENTION_STYLES: Record<AttentionLevel, string> = {
  blocked: 'bg-red-100 text-red-800',
  waiting: 'bg-amber-100 text-amber-800',
  ok: 'bg-green-100 text-green-800',
};

interface TenantRow extends OversightTenant {
  id: string;
}

export const SmsOversight: React.FC = () => {
  const [state, setState] = useState<OversightState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await dbService.getAdminSmsOverview()) as OversightState;
      setState(data);
      setError(null);
    } catch (err) {
      console.error('SMS oversight fetch failed', err);
      setError('Could not load SMS oversight.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: TenantRow[] = useMemo(() => {
    const tenants = state?.tenants || [];
    const matches = tenants.filter((t) => {
      if (filter === 'blocked') return t.attention === 'blocked';
      if (filter === 'waiting') return t.attention === 'waiting';
      if (filter === 'live') return t.ready && t.attention === 'ok';
      return true;
    });
    return matches.map((t) => ({ ...t, id: t.tenantKey }));
  }, [state, filter]);

  const columns: Column<TenantRow>[] = [
    {
      key: 'businessName',
      label: 'Business',
      sortable: true,
      render: (t) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">
            {t.businessName}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {t.ownerEmail || t.tenantKey}
          </div>
        </div>
      ),
    },
    {
      key: 'registrationStatus',
      label: '10DLC',
      sortable: true,
      render: (t) => (
        <div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              STATUS_STYLES[t.registrationStatus] ||
              'bg-slate-100 text-slate-600'
            }`}
          >
            {STATUS_LABELS[t.registrationStatus] || t.registrationStatus}
          </span>
          {t.registrationStep && t.registrationStatus !== 'ready' && (
            <div className="text-xs text-slate-500 mt-1">
              step: {t.registrationStep}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sender',
      label: 'Sender',
      sortable: true,
      render: (t) => (
        <div>
          <div className="font-mono text-xs text-slate-900">
            {t.sender || '—'}
          </div>
          <div className="text-xs text-slate-500">
            {t.plan ? t.plan.replace('SMS_', '') : 'no plan'}
            {t.paid ? '' : ' · unpaid'}
          </div>
        </div>
      ),
    },
    {
      key: 'usedSegments',
      label: 'Segments',
      sortable: true,
      render: (t) => (
        <div>
          <div className="text-sm text-slate-900">
            {t.usedSegments.toLocaleString()} /{' '}
            {t.includedSegments.toLocaleString()}
          </div>
          <div
            className={`text-xs ${
              t.budgetExhausted ? 'text-red-600 font-medium' : 'text-slate-500'
            }`}
          >
            ${t.overageUsd.toFixed(2)} of ${t.spendLimitUsd.toFixed(2)} overage
          </div>
        </div>
      ),
    },
    {
      key: 'delivered',
      label: `Sent (${state?.windowDays ?? 30}d)`,
      render: (t) => (
        <div className="text-xs text-slate-600">
          <div>{t.jobs.delivered.toLocaleString()} delivered</div>
          {t.jobs.delivery_failed > 0 && (
            <div className="text-red-600">
              {t.jobs.delivery_failed.toLocaleString()} failed
            </div>
          )}
          {t.jobs.queued + t.jobs.leased + t.jobs.sending > 0 && (
            <div>
              {(
                t.jobs.queued +
                t.jobs.leased +
                t.jobs.sending
              ).toLocaleString()}{' '}
              in flight
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'attention',
      label: 'Status',
      sortable: true,
      render: (t) => (
        <div className="max-w-xs">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${ATTENTION_STYLES[t.attention]}`}
          >
            {t.attention === 'blocked'
              ? 'Needs attention'
              : t.attention === 'waiting'
                ? 'Waiting'
                : 'Live'}
          </span>
          {t.reason && (
            <div className="text-xs text-slate-600 mt-1">{t.reason}</div>
          )}
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  const totals = state?.totals;
  const jobs = totals?.jobs;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">SMS Oversight</h2>
          <p className="text-sm text-slate-500">
            Every tenant's 10DLC registration, sender and message volume.
            Read-only — carrier registration is advanced by the tenant, never
            from here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {state && !state.launchEnabled && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">SMS launch is disabled.</strong>{' '}
          <code className="font-mono text-xs">SMS_LAUNCH_ENABLED</code> is not
          set to <code className="font-mono text-xs">true</code> on the backend,
          so registration, checkout and every outbound send return 503. Tenants
          can fill in the setup wizard but cannot submit it.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Smartphone}
          label="Tenants on SMS"
          value={totals?.tenants ?? 0}
          loading={loading}
          subtext={`${totals?.unregistered ?? 0} not yet registered`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Approved senders"
          value={totals?.ready ?? 0}
          variant="savings"
          loading={loading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Needs attention"
          value={totals?.blocked ?? 0}
          loading={loading}
          subtext={`${totals?.waiting ?? 0} awaiting carrier`}
        />
        <MetricCard
          icon={DollarSign}
          label="Overage billed"
          value={`$${(totals?.overageUsd ?? 0).toFixed(2)}`}
          variant="revenue"
          loading={loading}
        />
      </div>

      {jobs && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareText size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              Messages, last {state?.windowDays ?? 30} days
            </h3>
            {state?.jobsTruncated && (
              <span className="flex items-center gap-1 text-xs text-amber-700">
                <Clock size={12} />
                most recent 5,000 only — counts are a floor
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {JOB_STATUSES.map((status) => (
              <div key={status}>
                <div className="text-lg font-semibold text-slate-900">
                  {jobs[status].toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">
                  {status.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state?.tenantsTruncated && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Showing the 500 most recently active SMS tenants. Beyond that cap a
          registered tenant can appear as &ldquo;not started&rdquo;, so treat
          this list as a sample rather than the whole book.
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              filter === option.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchable
        searchPlaceholder="Search by business, email, sender or tenant key..."
        emptyMessage={
          filter === 'all'
            ? 'No tenant has opened SMS yet.'
            : 'No tenant matches this filter.'
        }
      />
    </div>
  );
};

export default SmsOversight;
