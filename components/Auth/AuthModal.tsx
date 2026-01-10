import { ArrowRight, Bot, Loader, Lock, Mail, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { buildApiUrl, safeParseJson } from '../../services/apiConfig';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'signup';
  onLoginSuccess?: (email: string, name?: string, companyName?: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultMode = 'login',
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint =
        mode === 'login'
          ? buildApiUrl('/auth/login')
          : buildApiUrl('/auth/signup');
      const referredBy = localStorage.getItem('bmb_ref_code');
      const body =
        mode === 'login'
          ? { email, password }
          : {
              email,
              password,
              name: email.split('@')[0],
              companyName,
              ...(referredBy ? { referredBy } : {}),
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await safeParseJson<{ error?: string }>(response);

      if (!data) {
        const message = response.ok
          ? 'Unexpected response from server'
          : `Authentication failed (${response.status})`;
        throw new Error(message);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Clear referral code after successful signup
      if (mode === 'signup' && referredBy) {
        localStorage.removeItem('bmb_ref_code');
      }

      // Refresh the page to reload with session
      window.location.reload();
    } catch (err) {
      console.error('Auth Error:', err);
      const message =
        err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-fade-in">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
        >
          <X size={20} />
        </button>

        <div className="p-8 text-center">
          <div className="w-12 h-12 bg-blue-900 rounded-xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-blue-900/30">
            <Bot size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
            {mode === 'login' ? 'Welcome Back' : 'Start Building Free'}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">
            {mode === 'login'
              ? 'Log in to manage your AI workforce.'
              : 'Join thousands of businesses automating with AI.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
              {error}
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label
                htmlFor="auth-company"
                className="block text-xs font-bold text-slate-500 uppercase mb-1"
              >
                Company Name
              </label>
              <input
                id="auth-company"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="Acme Inc."
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-3.5 text-slate-400"
                size={18}
              />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              Password
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-3.5 text-slate-400"
                size={18}
              />
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="••••••••"
              />
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-slate-400 mt-1">
                Minimum 6 characters
              </p>
            )}
            {mode === 'login' && (
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={() => {
                    const resetEmail =
                      email || prompt('Enter your email address:');
                    if (resetEmail) {
                      fetch(buildApiUrl('/auth/forgot-password'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: resetEmail }),
                      })
                        .then(async (res) => {
                          const data = await res.json();
                          if (data.debug_temp_pass) {
                            alert(
                              `Password reset! Your temporary password is: ${data.debug_temp_pass}\n\nPlease use this to log in and change it immediately.`,
                            );
                          } else {
                            alert(
                              data.message ||
                                'If an account exists with this email, a password reset link has been sent.',
                            );
                          }
                        })
                        .catch(() => {
                          alert('Unable to process request. Please try again.');
                        });
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 text-white py-3.5 rounded-xl font-bold hover:bg-blue-950 transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <Loader className="animate-spin" size={20} />
            ) : (
              <>
                {mode === 'login' ? 'Log In' : 'Create Account'}
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
              className="text-sm text-slate-500 hover:text-blue-900 font-medium"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
