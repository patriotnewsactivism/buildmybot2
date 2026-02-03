import {
  Bell,
  Building,
  CreditCard,
  Globe,
  Key,
  Lock,
  Plug,
  Save,
  Server,
  User,
  Webhook,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { User as UserType } from '../../types';
import { Integrations } from './Integrations';

interface SettingsProps {
  user?: UserType;
  onUpdateUser?: (user: UserType) => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [notification, setNotification] = useState<string | null>(null);

  // Local state for free text inputs
  const [customDomain, setCustomDomain] = useState(user?.customDomain || '');
  const [companyName, setCompanyName] = useState(user?.companyName || '');
  const [webhookUrl, setWebhookUrl] = useState('');

  const handleSave = () => {
    if (onUpdateUser && user) {
      onUpdateUser({
        ...user,
        companyName,
        customDomain,
      });
    }
    setNotification('Settings saved successfully!');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in relative">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Settings</h2>

      {notification && (
        <div className="absolute top-0 right-0 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in flex items-center gap-2">
          <Save size={16} /> {notification}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 space-y-1">
          {[
            { id: 'profile', label: 'My Profile', icon: User },
            { id: 'company', label: 'Company Info', icon: Building },
            { id: 'billing', label: 'Billing & Invoices', icon: CreditCard },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'integrations', label: 'Integrations', icon: Plug },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'developers', label: 'Developer API', icon: Webhook },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === item.id
                  ? 'bg-white text-blue-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">
                Personal Information
              </h3>
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-900 text-2xl font-bold">
                  {user?.name
                    ? user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .substring(0, 2)
                    : 'AJ'}
                </div>
                <button
                  type="button"
                  className="text-sm text-blue-900 font-medium hover:text-blue-950"
                >
                  Change Avatar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="settings-first-name"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    First Name
                  </label>
                  <input
                    id="settings-first-name"
                    type="text"
                    defaultValue={user?.name.split(' ')[0]}
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-last-name"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Last Name
                  </label>
                  <input
                    id="settings-last-name"
                    type="text"
                    defaultValue={user?.name.split(' ')[1]}
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                </div>
                <div className="col-span-2">
                  <label
                    htmlFor="settings-email"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Email Address
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    defaultValue={user?.email}
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'company' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">
                Business Details
              </h3>
              <div>
                <label
                  htmlFor="settings-company-name"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Company Name
                </label>
                <input
                  id="settings-company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                />
              </div>

              <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={18} className="text-blue-900" />
                  <h4 className="font-semibold text-slate-800">
                    White-Label Deployment
                  </h4>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  This app supports white-label deployment to your custom
                  domain.
                </p>
                <ol className="list-decimal ml-4 text-sm text-slate-600 space-y-2 mb-4">
                  <li>
                    Configure your cloud provider with your custom domain.
                  </li>
                  <li>
                    Point your DNS records (CNAME/A Record) as instructed by
                    your provider.
                  </li>
                  <li>
                    Enter that domain below so the app generates the correct
                    white-label links.
                  </li>
                </ol>
                <div>
                  <label
                    htmlFor="settings-custom-domain"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Custom Domain URL
                  </label>
                  <input
                    id="settings-custom-domain"
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="e.g., app.myagency.com"
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
                <Server className="text-blue-900 shrink-0 mt-0.5" size={18} />
                <div>
                  <h5 className="text-sm font-bold text-blue-900">
                    Environment Config
                  </h5>
                  <p className="text-xs text-blue-700 mt-1">
                    Ensure you have set <code>OPENAI_API_KEY</code> in your
                    Environment Variables or Cloud Build Arguments.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="settings-industry"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Industry
                </label>
                <select
                  id="settings-industry"
                  className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                >
                  <option>Marketing Agency</option>
                  <option>E-commerce</option>
                  <option>Real Estate</option>
                  <option>SaaS</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && <Integrations />}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">
                Alerts & Notifications
              </h3>
              <div className="space-y-4">
                {[
                  'SMS Alert: Hot Lead Detected (Score > 80)',
                  'Email Alert: New Lead Captured',
                  'Daily performance summary',
                  'Weekly analytics report',
                  'System updates and maintenance',
                  'Reseller commission alerts',
                ].map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                  >
                    <span
                      className={`text-sm ${item.includes('Hot Lead') ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                    >
                      {item}
                      {item.includes('Hot Lead') && (
                        <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          High Priority
                        </span>
                      )}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        defaultChecked={i < 3}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-900" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'developers' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">
                Developers & Integrations
              </h3>

              <div>
                <label
                  htmlFor="settings-webhook-url"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Webhook URL
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  We will POST JSON data to this URL for events like{' '}
                  <code>lead.captured</code>.
                </p>
                <div className="relative">
                  <Webhook
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={18}
                  />
                  <input
                    id="settings-webhook-url"
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-api.com/webhooks"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-bold text-slate-800">API Access Token</h5>
                  <button
                    type="button"
                    className="text-xs text-blue-900 font-medium hover:underline"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-lg">
                  <Key size={16} className="text-slate-400" />
                  <code className="text-xs text-slate-600 font-mono flex-1">
                    sk_live_51Msz...x92a
                  </code>
                  <button
                    type="button"
                    className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 hover:text-slate-900"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Use this token to authenticate requests to the BuildMyBot API.
                </p>
              </div>
            </div>
          )}

          {/* Placeholder for other tabs */}
          {(activeTab === 'security' || activeTab === 'billing') && (
            <div className="text-center py-12 text-slate-400">
              <Lock size={48} className="mx-auto mb-4 opacity-20" />
              <p>
                This section is handled securely via our payment provider
                (Stripe).
              </p>
              <button
                type="button"
                className="mt-4 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-600"
              >
                Manage on Stripe
              </button>
            </div>
          )}

          {activeTab !== 'security' &&
            activeTab !== 'billing' &&
            activeTab !== 'integrations' && (
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-blue-900 text-white rounded-lg font-medium hover:bg-blue-950 shadow-sm transition flex items-center gap-2"
                >
                  <Save size={18} /> Save Changes
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
