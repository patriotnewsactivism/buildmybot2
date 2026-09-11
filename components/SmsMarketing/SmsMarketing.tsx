import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader,
  MessageSquareText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  SMS_MARKETING_PRICING,
  SMS_MARKETING_REGISTRATION_FEE,
} from '../../constants';
import { buildApiUrl } from '../../services/apiConfig';
import { SmsAccountSettings } from './SmsAccountSettings';
import { SmsProgramsPanel } from './SmsProgramsPanel';

/**
 * Guided SMS (10DLC) setup + live provisioning status.
 *
 * The tenant fills this out once and never sees Telnyx. Real carrier
 * registration needs real business identity (legal name, EIN, address) --
 * that cannot be skipped on any provider -- but submission and status
 * tracking both happen here.
 *
 * Why a wizard rather than the single long form this replaced: the payload
 * `POST /api/sms/register` requires is 19 fields across four unrelated
 * subjects (legal identity, carrier content review, consent links, number
 * choice). One page of 19 required inputs is where tenants gave up.
 *
 * Two bugs this fixes, both of which made the previous form unusable:
 *
 *  1. It posted only 14 of the 19 required fields. `vertical`, `entityType`,
 *     `privacyPolicyLink`, `termsAndConditionsLink` and `areaCode` have no
 *     server default, and `website` is `z.url()` (required) while the form
 *     labelled it optional and allowed ''. Every submission 400'd on Zod
 *     validation before reaching Telnyx.
 *
 *  2. It rendered `status.brand.status` / `status.campaign.*`, which
 *     `GET /api/sms/register` has never returned. The real shape is
 *     { registered, status, step, error, smsReady }. A registered tenant saw
 *     "Business ()" stuck on "Pending" forever, and never saw the real
 *     provisioning step, the carrier rejection reason, or `waiting_funding`.
 *
 * Opt-in/opt-out/HELP keywords are deliberately NOT collected: api/sms/register.ts
 * composes carrier-compliant ones itself when it builds the campaign. They are
 * shown read-only in step 3 so the tenant knows what was filed on their behalf.
 */

type WizardStep = 1 | 2 | 3 | 4 | 5;
const TOTAL_STEPS = 5;

type DashTab =
  | 'programs'
  | 'inbox'
  | 'contacts'
  | 'appointments'
  | 'settings';

/** Mirrors the `registration` zod schema in api/sms/register.ts exactly. */
interface FormState {
  companyName: string;
  ein: string;
  entityType: 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT';
  vertical: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  areaCode: string;
  usecase: 'MIXED' | 'SWEEPSTAKES';
  description: string;
  sample1: string;
  sample2: string;
  messageFlow: string;
  helpMessage: string;
  privacyPolicyLink: string;
  termsAndConditionsLink: string;
}

const EMPTY_FORM: FormState = {
  companyName: '',
  ein: '',
  entityType: 'PRIVATE_PROFIT',
  vertical: '',
  phone: '',
  email: '',
  website: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  areaCode: '',
  usecase: 'MIXED',
  description: '',
  sample1: '',
  sample2: '',
  messageFlow: '',
  helpMessage: '',
  privacyPolicyLink: '',
  termsAndConditionsLink: '',
};

/** The shape GET /api/sms/register actually returns. */
interface RegistrationStatus {
  registered: boolean;
  status:
    | 'not_registered'
    | 'pending'
    | 'working'
    | 'waiting_funding'
    | 'unknown'
    | 'ready'
    | string;
  step?: string;
  error?: string | null;
  smsReady?: boolean;
}

/** Carrier vertical codes Telnyx accepts for 10DLC brands. */
const VERTICALS = [
  'PROFESSIONAL',
  'REAL_ESTATE',
  'HEALTHCARE',
  'HOSPITALITY',
  'RETAIL',
  'HOME_SERVICES',
  'AUTOMOTIVE',
  'FINANCIAL',
  'NGO',
  'EDUCATION',
  'TECHNOLOGY',
  'ENTERTAINMENT',
] as const;

/**
 * Keywords api/sms/register.ts files with the carrier on the tenant's behalf.
 * Kept in sync with the campaignBuilder body there — shown, never collected.
 */
const COMPLIANCE_KEYWORDS = {
  optIn: 'START, YES, SUBSCRIBE',
  optOut: 'STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT',
  help: 'HELP, INFO',
};

/** Human copy for each provisioning step the backend reports. */
const STEP_COPY: Record<string, string> = {
  brand: 'Filing your business identity with the carriers',
  campaign: 'Registering your messaging campaign',
  number: 'Reserving an SMS number in your area code',
  assignment: 'Attaching your number to the approved campaign',
  complete: 'Setup complete',
};

function StatusPanel({
  status,
  onRefresh,
}: {
  status: RegistrationStatus;
  onRefresh: () => void;
}) {
  const ready = status.status === 'ready' || status.smsReady === true;
  const needsSupport = status.status === 'unknown';
  const waitingFunding = status.status === 'waiting_funding';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Carrier registration</span>
        {ready ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Approved — sending is live
          </span>
        ) : needsSupport ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            <XCircle className="h-4 w-4" /> Needs support review
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            <Clock className="h-4 w-4" /> In progress
          </span>
        )}
      </div>

      {!ready && status.step && (
        <p className="text-sm text-gray-600">
          Current stage: {STEP_COPY[status.step] || status.step}
        </p>
      )}

      {waitingFunding && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Your payment came through. We're waiting on provider funding before we
          can buy your number — no action needed from you.
        </p>
      )}

      {needsSupport && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          A provider step returned an uncertain result, so we stopped rather
          than risk buying a second number. Support is reconciling it — please
          contact us if this doesn't clear within one business day.
        </p>
      )}

      {status.error && !needsSupport && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          {status.error}
        </p>
      )}

      {!ready && !needsSupport && (
        <p className="text-sm text-gray-500">
          Carrier approval usually takes 1–7 business days. This page updates
          itself — nothing more is needed from you.
        </p>
      )}

      <button
        type="button"
        onClick={onRefresh}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        Refresh status
      </button>
    </div>
  );
}

export const SmsMarketing: React.FC = () => {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DashTab>('programs');

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch(buildApiUrl('/sms/register'), {
        credentials: 'include',
      });
      if (response.ok) setStatus(await response.json());
    } catch {
      // Silent — the wizard below still works; the status panel stays empty.
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const update =
    (field: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  /**
   * Gate each step on the same rules the server enforces, so a tenant finds
   * out about a bad EIN on step 1 rather than after submitting 19 fields.
   */
  const stepValid = (target: WizardStep): boolean => {
    if (target === 1) {
      return (
        form.companyName.trim().length >= 2 &&
        /^\d{2}-?\d{7}$/.test(form.ein) &&
        form.vertical.length >= 2 &&
        /^\+1\d{10}$/.test(form.phone) &&
        /.+@.+\..+/.test(form.email) &&
        /^https?:\/\/.+/.test(form.website)
      );
    }
    if (target === 2) {
      return (
        form.street.trim().length >= 3 &&
        form.city.trim().length >= 2 &&
        form.state.trim().length === 2 &&
        /^\d{5}(-\d{4})?$/.test(form.postalCode) &&
        /^\d{3}$/.test(form.areaCode)
      );
    }
    if (target === 3) {
      return (
        /^https?:\/\/.+/.test(form.privacyPolicyLink) &&
        /^https?:\/\/.+/.test(form.termsAndConditionsLink)
      );
    }
    if (target === 4) {
      return (
        form.description.trim().length >= 40 &&
        form.sample1.trim().length >= 20 &&
        form.sample2.trim().length >= 20 &&
        form.messageFlow.trim().length >= 40 &&
        form.helpMessage.trim().length >= 20
      );
    }
    return true;
  };

  const canAdvance = stepValid(step);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
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
      setStatus(data);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const registered = status?.registered === true;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquareText className="h-6 w-6 text-indigo-600" /> SMS
          Marketing
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Text your customers from a number registered to your business. US
          carriers require every business to be verified before the first
          message sends — we handle the filing.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Plans</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SMS_MARKETING_PRICING.map(