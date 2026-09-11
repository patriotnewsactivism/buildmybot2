import { MessageSquare, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';

export function CorporatePhoneDemo() {
  const [status, setStatus] = useState<{
    number: string;
    displayNumber: string;
    voiceConfigured: boolean;
    smsReady: boolean;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/corporate-phone`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);
  return (
    <section
      id="phone-demo"
      className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 space-y-5"
    >
      <div>
        <p className="text-sm font-semibold text-blue-700">
          Meet our sales team
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-2">
          One business. Voice, chat, and text.
        </h2>
        <p className="text-slate-600 mt-3">
          Call BuildMyBot to ask about your business, explore a use case, or
          hear our AI sales assistant in action.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {status?.voiceConfigured ? (
          <a
            href={`tel:${status.number}`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-white font-semibold"
          >
            <Phone size={18} /> Call {status.displayNumber}
          </a>
        ) : (
          <p className="text-sm text-slate-600">
            Our corporate phone demo is being connected. Try the browser voice
            demo below.
          </p>
        )}
        {status?.smsReady ? (
          <a
            href={`sms:${status.number}?body=DEMO`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800"
          >
            <MessageSquare size={18} /> Text DEMO
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800"
          >
            <MessageSquare size={18} /> Preview an SMS conversation
          </button>
        )}
      </div>
      {status?.smsReady ? (
        <p className="text-xs text-slate-500">
          Texting DEMO requests a reply about BuildMyBot. No marketing
          subscription. Message and data rates may apply. Reply STOP to stop or
          HELP for help.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Live texting is awaiting carrier activation. The SMS preview does not
          send messages.
        </p>
      )}
      {preview && !status?.smsReady && (
        <div
          className="max-w-md rounded-xl border border-slate-200 bg-white p-4 space-y-3"
          aria-live="polite"
        >
          <p className="text-xs font-semibold text-slate-500">
            EXAMPLE CONVERSATION · NO SMS SENT
          </p>
          <p className="rounded-lg bg-blue-50 p-3 text-sm">
            Can your AI answer calls while I’m helping a customer?
          </p>
          <p className="rounded-lg bg-slate-100 p-3 text-sm">
            BuildMyBot: Yes. An AI phone agent can answer common questions and
            collect lead details for your team. What kind of business do you
            run?
          </p>
        </div>
      )}
    </section>
  );
}
