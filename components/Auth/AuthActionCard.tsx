import { Bot } from 'lucide-react';
import type React from 'react';

interface AuthActionCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

/** Centered card matching the login/signup modal, for full-page auth links. */
export const AuthActionCard: React.FC<AuthActionCardProps> = ({
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-12 h-12 bg-blue-900 rounded-xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-blue-900/30">
            <Bot size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="text-slate-500 mt-2 text-sm">{subtitle}</p>
        </div>
        <div className="px-8 pb-8 space-y-4">{children}</div>
      </div>
    </div>
  );
};

export const authInputClassName =
  'w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-blue-900 focus:border-blue-900 text-slate-900 bg-white';

export const authPrimaryButtonClassName =
  'w-full bg-blue-900 text-white py-3.5 rounded-xl font-bold hover:bg-blue-950 transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-60';
