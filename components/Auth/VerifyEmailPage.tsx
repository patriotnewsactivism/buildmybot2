import { ArrowRight, Loader } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthActionCard, authPrimaryButtonClassName } from './AuthActionCard';
import { verifyEmailToken } from './authActionClient';

type VerifyPhase = 'loading' | 'success' | 'invalid' | 'error';

const MISSING_TOKEN =
  'This verification link is missing a token. Open the link from your email, or request a new one.';

export const VerifyEmailPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [phase, setPhase] = useState<VerifyPhase>(
    token ? 'loading' : 'invalid',
  );
  const [message, setMessage] = useState(token ? '' : MISSING_TOKEN);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPhase('loading');
    setMessage('');
    verifyEmailToken(token).then((outcome) => {
      if (cancelled) return;
      setMessage(outcome.message);
      if (outcome.status === 'success') setPhase('success');
      else if (outcome.status === 'invalid') setPhase('invalid');
      else setPhase('error');
    });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return (
    <AuthActionCard
      title="Verify your email"
      subtitle="Confirm this address so your BuildMyBot account can be activated."
    >
      {phase === 'loading' && (
        <output className="flex items-center justify-center gap-2 text-slate-500 text-sm py-4">
          <Loader className="animate-spin" size={18} />
          Verifying your email…
        </output>
      )}

      {phase === 'success' && (
        <output className="block p-3 bg-emerald-50 text-emerald-800 text-sm rounded-lg border border-emerald-200">
          {message || 'Email verified'}
        </output>
      )}

      {phase === 'invalid' && (
        <div
          role="alert"
          className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200"
        >
          {message ||
            'This verification link is invalid, expired, or already used.'}
        </div>
      )}

      {phase === 'error' && (
        <div
          role="alert"
          className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100"
        >
          {message || 'Something went wrong. Please try again.'}
        </div>
      )}

      {phase === 'success' && (
        <Link to="/?auth=login" className={authPrimaryButtonClassName}>
          Log in
          <ArrowRight size={18} />
        </Link>
      )}

      {phase === 'error' && token && (
        <button
          type="button"
          className={authPrimaryButtonClassName}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </button>
      )}

      <div className="text-center">
        <Link
          to="/"
          className="text-sm text-slate-500 hover:text-blue-900 font-medium"
        >
          Back to home
        </Link>
      </div>
    </AuthActionCard>
  );
};
