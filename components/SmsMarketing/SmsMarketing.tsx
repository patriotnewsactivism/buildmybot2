import { CheckCircle2, Clock, Loader, MessageSquareText, XCircle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { SMS_MARKETING_PRICING } from '../../constants';
import { buildApiUrl } from '../../services/apiConfig';

/**
 * Standalone SMS marketing registration + status page.
 *
 * NOT YET LINKED from any nav (Don's call, 2026-09-04) -- exists at
 * /app/sms-marketing but there is deliberately no sidebar entry pointing
 * here yet. Flip it on by adding an entry to navConfig.tsx once a real
 * Telnyx account + a test registration have been verified end-to-end.
 *
 * The whole point: the tenant fills out ONE form, on this page, and never
 * sees Telnyx. Real carrier (10DLC) registration requires real business
 * info (legal name, EIN, address) -- that part can't be skipped by anyone,
 * on any provider -- but submission and status tracking both happen here.
 */

interface RegistrationStatus {
  registered: boolean;
  brand?: { companyName: string; status: string; failureReason?: string | null };
  campaign?: { usecase: string; status: string; failureReason?: string | null } | null;
  smsReady?: boolean;
}

interface FormState {
  companyName: string;
  ein: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  email: string;
  website: string;
  description: string;
  sample1: string;
  sample2: string;
  messageFlow: string;
  helpMessage: string;
}

const EMPTY_FORM: FormState = {
  companyName: '',
  ein: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  email: '',
  website: '',
  description: '',
  sample1: '',
  sample2: '',
  messageFlow: '',
  helpMessage: '',
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  if (normalized === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Approved
      </span>
    );
  }
  if (normalized === 'FAILED' || normalized === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
        <XCircle className="h-4 w-4" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
      <Clock className="h-4 w-4" /> Pending carrier approval
    </span>
  );
}

export const SmsMarketing: React.FC = () => {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successNote, setSuccessNote] = useState('');

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch(buildApiUrl('/sms/register'), { credentials: 'include' });
      if (response.ok) {
        setStatus(await response.json());
      }
    } catch {
      // Silent -- the form below still works; status panel just stays empty.
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const updateField = (field: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessNote('');
    try {
      const response = await fetch(buildApiUrl('/sms/register'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      setSuccessNote(data.note || 'Submitted for carrier review.');
      await loadStatus();
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquareText className="h-6 w-6 text-indigo-600" />
          SMS Marketing
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Send SMS marketing campaigns straight from BuildMyBot -- no separate account, no
          separate login. Carrier registration below is required by mobile carriers for every
          business that sends SMS at volume, not just BuildMyBot.
        </p>
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {SMS_MARKETING_PRICING.map((plan) => (
            <div key={plan.id} className="rounded-md border p-4">
              <p className="text-sm font-medium text-gray-500">{plan.name}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                ${plan.price}
                <span className="text-sm font-normal text-gray-500">/mo</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Registration status</h2>
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader className="h-4 w-4 animate-spin" /> Checking...
          </div>
        ) : status?.registered ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Business ({status.brand?.companyName})</span>
              <StatusBadge status={status.brand?.status || 'pending'} />
            </div>
            {status.campaign && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Campaign ({status.campaign.usecase})</span>
                <StatusBadge status={status.campaign.status} />
              </div>
            )}
            {status.smsReady && (
              <p className="text-sm font-medium text-emerald-700">
                You're approved -- SMS marketing sends are live on your account.
              </p>
            )}
            {!status.smsReady && (
              <p className="text-sm text-gray-500">
                Carrier approval typically takes 1-7 business days. This page updates
                automatically once approved -- no action needed from you.
              </p>
            )}
            {(status.brand?.failureReason || status.campaign?.failureReason) && (
              <p className="text-sm text-red-600">
                {status.brand?.failureReason || status.campaign?.failureReason}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Not registered yet -- fill out the form below to get started.
          </p>
        )}
      </div>

      {!status?.registered && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Register your business</h2>
          <p className="text-sm text-gray-500">
            This information goes straight to carrier registration -- it must match your real
            business records (legal name, EIN, address).
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal company name" value={form.companyName} onChange={updateField('companyName')} required />
            <Field label="EIN (XX-XXXXXXX)" value={form.ein} onChange={updateField('ein')} required />
            <Field label="Business phone" value={form.phone} onChange={updateField('phone')} placeholder="+15551234567" required />
            <Field label="Business email" value={form.email} onChange={updateField('email')} type="email" required />
            <Field label="Street address" value={form.street} onChange={updateField('street')} required />
            <Field label="City" value={form.city} onChange={updateField('city')} required />
            <Field label="State" value={form.state} onChange={updateField('state')} required />
            <Field label="ZIP / postal code" value={form.postalCode} onChange={updateField('postalCode')} required />
            <Field label="Website (optional)" value={form.website} onChange={updateField('website')} />
          </div>

          <hr className="my-2" />
          <p className="text-sm font-medium text-gray-700">Campaign details</p>

          <TextArea
            label="What will you send? (2-4 sentences)"
            value={form.description}
            onChange={updateField('description')}
            required
          />
          <TextArea label="Sample message 1" value={form.sample1} onChange={updateField('sample1')} required />
          <TextArea label="Sample message 2" value={form.sample2} onChange={updateField('sample2')} required />
          <TextArea
            label="How do customers opt in?"
            value={form.messageFlow}
            onChange={updateField('messageFlow')}
            placeholder="e.g. Customers opt in by checking a box at checkout / texting JOIN to our number."
            required
          />
          <TextArea
            label="Reply to the HELP keyword"
            value={form.helpMessage}
            onChange={updateField('helpMessage')}
            placeholder="e.g. Acme Corp alerts. For help visit acme.com/support. Reply STOP to cancel."
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successNote && <p className="text-sm text-emerald-700">{successNote}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Register for SMS marketing'}
          </button>
        </form>
      )}
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={2}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}
