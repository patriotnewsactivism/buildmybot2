import {
  ArrowLeft,
  Building,
  CheckCircle,
  Lock,
  Mail,
  Shield,
  User,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface PartnerFormData {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

interface PartnerSignupProps {
  onBack: () => void;
  onComplete: (data: PartnerFormData) => void;
}

export const PartnerSignup: React.FC<PartnerSignupProps> = ({
  onBack,
  onComplete,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    companyName: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would hit the backend API to create the user
    onComplete(formData);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Left Side - Visuals */}
      <div className="w-full md:w-1/2 bg-slate-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />

        <div className="relative z-10">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-8"
          >
            <ArrowLeft size={20} /> Back
          </button>
          <h1 className="text-4xl font-extrabold mb-4">Partner Program</h1>
          <p className="text-lg text-slate-300">
            Join 1,000+ agencies reselling AI to local businesses.
          </p>
        </div>

        <div className="space-y-6 relative z-10 my-12 md:my-0">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-lg">
              <Building className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg">White-Label Ready</h3>
              <p className="text-slate-400 text-sm">
                Your brand, your domain. We stay invisible.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-lg">
              <Shield className="text-emerald-400" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Secure Payouts</h3>
              <p className="text-slate-400 text-sm">
                Bank-grade security for your commissions.
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 relative z-10">
          © 2025 BuildMyBot. Secure Enrollment.
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full md:w-1/2 p-8 md:p-12 flex items-center justify-center bg-white">
        <div className="max-w-md w-full">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              Create Partner Account
            </h2>
            <p className="text-slate-500">
              Get instant access to your reseller dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="partner-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Full Name
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  id="partner-name"
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-blue-900 focus:border-blue-900"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="partner-email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Work Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  id="partner-email"
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-blue-900 focus:border-blue-900"
                  placeholder="john@agency.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="partner-company"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Agency / Company Name
              </label>
              <div className="relative">
                <Building
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  id="partner-company"
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-blue-900 focus:border-blue-900"
                  placeholder="Acme Digital"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="partner-password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  id="partner-password"
                  type="password"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-blue-900 focus:border-blue-900"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 text-sm text-blue-800">
              <Lock size={16} className="shrink-0 mt-0.5" />
              <p>
                Your banking info will be requested inside the secure dashboard
                to process payouts.
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-950 transition shadow-lg mt-4"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
