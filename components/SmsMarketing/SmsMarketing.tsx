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
import { DigitalSignageShowcase } from './DigitalSignageShowcase';
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

type DashTab = 'programs' | 'inbox' | 'contacts' | 'appointments' | 'settings';

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
          message sends — we handle the filing. While you remain a client, our
          studio designs up to 3 original digital signs for you each month at no
          extra charge.
        </p>
      </div>

      <DigitalSignageShowcase variant="studio" />

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Plans</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SMS_MARKETING_PRICING.map((plan) => (
            <div
              key={plan.id}
              className="rounded-md border border-gray-200 p-3"
            >
              <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
              <p className="text-sm text-gray-600">
                ${plan.price}/mo · {plan.messagesIncluded.toLocaleString()} msgs
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                then ${plan.overagePerMessage.toFixed(3)}/msg
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          <s>${SMS_MARKETING_REGISTRATION_FEE.listPrice}</s>{' '}
          <span className="font-semibold text-gray-800">
            ${SMS_MARKETING_REGISTRATION_FEE.price}
          </span>{' '}
          registration — for a limited time only. Non-refundable due to
          provisioning costs.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Registration status
        </h2>
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader className="h-4 w-4 animate-spin" /> Checking…
          </div>
        ) : registered && status ? (
          <StatusPanel status={status} onRefresh={loadStatus} />
        ) : (
          <p className="text-sm text-gray-500">
            Not registered yet — the {TOTAL_STEPS} steps below get you approved.
          </p>
        )}
      </div>

      {registered && !loadingStatus && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
            {(
              [
                ['programs', 'Programs'],
                ['inbox', 'Inbox'],
                ['contacts', 'Contacts'],
                ['appointments', 'Appointments'],
                ['settings', 'Settings'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === id
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'programs' && <SmsProgramsPanel />}
          {tab === 'settings' && <SmsAccountSettings />}
          {tab === 'inbox' && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
              Inbox panel next — wire GET /sms/inbox and POST /sms/send.
            </p>
          )}
          {tab === 'contacts' && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
              Contacts panel next — wire GET/POST /sms/contacts.
            </p>
          )}
          {tab === 'appointments' && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
              Appointments panel next — wire GET/POST /sms/appointments.
            </p>
          )}
        </div>
      )}

      {!registered && !loadingStatus && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Step {step} of {TOTAL_STEPS}
              </h2>
              <span className="text-sm text-gray-500">
                {Math.round(((step - 1) / TOTAL_STEPS) * 100)}% complete
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${((step - 1) / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Your business</h3>
              <p className="text-sm text-gray-600">
                This must match your legal registration exactly — carriers check
                it against public records, and a mismatch is the most common
                cause of rejection.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Legal company name"
                  value={form.companyName}
                  onChange={update('companyName')}
                  required
                />
                <Field
                  label="EIN (XX-XXXXXXX)"
                  value={form.ein}
                  onChange={update('ein')}
                  placeholder="12-3456789"
                  required
                />
                <Select
                  label="Entity type"
                  value={form.entityType}
                  onChange={update('entityType')}
                  options={[
                    ['PRIVATE_PROFIT', 'Private company'],
                    ['PUBLIC_PROFIT', 'Publicly traded company'],
                    ['NON_PROFIT', 'Non-profit'],
                  ]}
                />
                <Select
                  label="Industry"
                  value={form.vertical}
                  onChange={update('vertical')}
                  options={[
                    ['', 'Select an industry…'],
                    ...VERTICALS.map(
                      (v) =>
                        [v, v.replace(/_/g, ' ').toLowerCase()] as [
                          string,
                          string,
                        ],
                    ),
                  ]}
                />
                <Field
                  label="Business phone"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="+15551234567"
                  required
                />
                <Field
                  label="Business email"
                  value={form.email}
                  onChange={update('email')}
                  type="email"
                  required
                />
              </div>
              <Field
                label="Website"
                value={form.website}
                onChange={update('website')}
                placeholder="https://example.com"
                required
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">
                Address and your number
              </h3>
              <p className="text-sm text-gray-600">
                We buy and register an SMS-capable number for you in the area
                code you choose. There is nothing to set up with a carrier
                yourself.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Street address"
                  value={form.street}
                  onChange={update('street')}
                  required
                />
                <Field
                  label="City"
                  value={form.city}
                  onChange={update('city')}
                  required
                />
                <Field
                  label="State (2 letters)"
                  value={form.state}
                  onChange={update('state')}
                  placeholder="LA"
                  required
                />
                <Field
                  label="ZIP code"
                  value={form.postalCode}
                  onChange={update('postalCode')}
                  placeholder="70801"
                  required
                />
                <Field
                  label="Preferred area code"
                  value={form.areaCode}
                  onChange={update('areaCode')}
                  placeholder="225"
                  required
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">
                Consent and opt-out
              </h3>
              <p className="text-sm text-gray-600">
                Carriers require a reachable privacy policy and terms page
                before approving a campaign.
              </p>
              <Field
                label="Privacy policy URL"
                value={form.privacyPolicyLink}
                onChange={update('privacyPolicyLink')}
                placeholder="https://example.com/privacy"
                required
              />
              <Field
                label="Terms and conditions URL"
                value={form.termsAndConditionsLink}
                onChange={update('termsAndConditionsLink')}
                placeholder="https://example.com/terms"
                required
              />
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                  <ShieldCheck className="h-4 w-4" /> Handled for you
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  We file these keywords with the carrier and honour them
                  automatically on every message — you don't configure them.
                </p>
                <dl className="mt-3 space-y-1 text-sm text-emerald-900">
                  <div className="flex gap-2">
                    <dt className="font-medium">Opt in:</dt>
                    <dd>{COMPLIANCE_KEYWORDS.optIn}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium">Opt out:</dt>
                    <dd>{COMPLIANCE_KEYWORDS.optOut}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium">Help:</dt>
                    <dd>{COMPLIANCE_KEYWORDS.help}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">
                What you'll be sending
              </h3>
              <p className="text-sm text-gray-600">
                A human reviewer at the carrier reads this. Be specific and
                concrete — vague answers are the second most common rejection.
              </p>
              <Select
                label="Campaign type"
                value={form.usecase}
                onChange={update('usecase')}
                options={[
                  ['MIXED', 'Marketing, customer care and notifications'],
                  ['SWEEPSTAKES', 'Contests and sweepstakes'],
                ]}
              />
              <TextArea
                label="What will you send? (at least 40 characters)"
                value={form.description}
                onChange={update('description')}
                required
              />
              <TextArea
                label="Sample message 1 (at least 20 characters)"
                value={form.sample1}
                onChange={update('sample1')}
                required
              />
              <TextArea
                label="Sample message 2 (at least 20 characters)"
                value={form.sample2}
                onChange={update('sample2')}
                required
              />
              <TextArea
                label="How do customers opt in? (at least 40 characters)"
                value={form.messageFlow}
                onChange={update('messageFlow')}
                placeholder="Customers check a consent box on our booking form at example.com/book, which stores the timestamp."
                required
              />
              <TextArea
                label="Your reply to the HELP keyword (at least 20 characters)"
                value={form.helpMessage}
                onChange={update('helpMessage')}
                placeholder="Acme Plumbing: call 555-123-4567 or email help@acme.com. Reply STOP to unsubscribe."
                required
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Review and submit</h3>
              <p className="text-sm text-gray-600">
                Submitting files your brand and campaign with the carriers. It
                can't be edited while under review, so check the details below.
              </p>
              <dl className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {[
                  ['Company', form.companyName],
                  ['EIN', form.ein],
                  ['Industry', form.vertical.replace(/_/g, ' ').toLowerCase()],
                  ['Phone', form.phone],
                  ['Website', form.website],
                  [
                    'Address',
                    `${form.street}, ${form.city}, ${form.state} ${form.postalCode}`,
                  ],
                  ['Area code', form.areaCode],
                  [
                    'Campaign',
                    form.usecase === 'MIXED'
                      ? 'Marketing, customer care and notifications'
                      : 'Contests and sweepstakes',
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 px-3 py-2 text-sm"
                  >
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-right font-medium text-gray-900">
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-gray-500">
                Registration and number provisioning start once your first month
                is paid.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
              disabled={step === 1}
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as WizardStep)}
                disabled={!canAdvance}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {submitting && <Loader className="h-4 w-4 animate-spin" />}
                Submit for carrier approval
              </button>
            )}
          </div>
        </div>
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

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-indigo-500 focus:outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
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
