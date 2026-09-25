import { ArrowRight, Loader, Lock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordConfirmation,
} from '../../shared/auth-links';
import {
  AuthActionCard,
  authInputClassName,
  authPrimaryButtonClassName,
} from './AuthActionCard';
import { resetPasswordWithToken } from './authActionClient';

type ResetPhase = 'form' | 'submitting' | 'success' | 'invalid';

const MISSING_TOKEN =
  'This reset link is missing a token. Request a new password reset and open the link from that email.';

export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<ResetPhase>(token ? 'form' : 'invalid');
  const [message, setMessage] = useState(token ? '' : MISSING_TOKEN);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validatePasswordConfirmation(password, confirm);
    if (problem) {
      setMessage(problem);
      return;
    }

    setPhase('submitting');
    setMessage('');
    const outcome = await resetPasswordWithToken(token, password);
    if (outcome.status === 'success') {
      setPhase('success');
      setMessage(outcome.message);
      return;
    }
    if (outcome.status === 'invalid') {
      setPhase('invalid');
      setMessage(outcome.message);
      return;
    }
    setPhase('form');
    setMessage(outcome.message);
  };

  return (
    <AuthActionCard
      title="Reset your password"
      subtitle="Choose a new password for your BuildMyBot account."
    >
      {phase === 'invalid' && (
        <div
          role="alert"
          className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200"
        >
          {message || 'This reset link is invalid, expired, or already used.'}
        </div>
      )}

      {phase === 'success' && (
        <>
          <output className="block p-3 bg-emerald-50 text-emerald-800 text-sm rounded-lg border border-emerald-200">
            {message || 'Password updated'}
          </output>
          <Link to="/?auth=login" className={authPrimaryButtonClassName}>
            Log in
            <ArrowRight size={18} />
          </Link>
        </>
      )}

      {(phase === 'form' || phase === 'submitting') && (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {message && (
            <div
              role="alert"
              className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100"
            >
              {message}
            </div>
          )}

          <div>
            <label
              htmlFor="reset-password"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              New password
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-3.5 text-slate-400"
                size={18}
              />
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={authInputClassName}
                placeholder="••••••••"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          </div>

          <div>
            <label
              htmlFor="reset-password-confirm"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              Confirm password
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-3.5 text-slate-400"
                size={18}
              />
              <input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={authInputClassName}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={phase === 'submitting'}
            className={authPrimaryButtonClassName}
          >
            {phase === 'submitting' ? (
              <>
                <Loader className="animate-spin" size={20} />
                Updating password…
              </>
            ) : (
              <>
                Update password
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
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
