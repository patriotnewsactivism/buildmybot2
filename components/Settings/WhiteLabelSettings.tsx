import {
  AlertCircle,
  Building2,
  CheckCircle,
  Code,
  Eye,
  EyeOff,
  Globe,
  Image,
  Loader2,
  Mail,
  Palette,
  RefreshCw,
  Save,
  Shield,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface BrandingSettings {
  id?: string;
  organizationId: string;
  customDomain?: string;
  domainVerified?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  companyName?: string;
  supportEmail?: string;
  customCss?: string;
  hideBuiltWithBadge?: boolean;
}

interface WhiteLabelSettingsProps {
  organizationId: string;
}

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const ColorPicker: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}> = ({ label, value, onChange, description }) => (
  <div className="space-y-2">
    <p className="block text-sm font-medium text-slate-700">{label}</p>
    {description && <p className="text-xs text-slate-500">{description}</p>}
    <div className="flex items-center gap-3">
      <div
        className="w-12 h-12 rounded-lg border-2 border-slate-200 cursor-pointer overflow-hidden relative"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm"
      />
    </div>
  </div>
);

const FileUploadZone: React.FC<{
  label: string;
  currentUrl?: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  accept?: string;
  description?: string;
  previewSize?: 'small' | 'large';
}> = ({
  label,
  currentUrl,
  onUpload,
  onClear,
  accept = 'image/*',
  description,
  previewSize = 'large',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  const sizeClasses = previewSize === 'small' ? 'w-16 h-16' : 'w-32 h-32';

  return (
    <div className="space-y-2">
      <p className="block text-sm font-medium text-slate-700">{label}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}

      {currentUrl ? (
        <div className="flex items-center gap-4">
          <div
            className={`${sizeClasses} rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center`}
          >
            <img
              src={currentUrl}
              alt={label}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={onClear}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <X size={14} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isDragging
              ? 'border-orange-500 bg-orange-50'
              : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50'
          }`}
          aria-label={`Upload ${label}`}
        >
          <Upload className="mx-auto text-slate-400 mb-2" size={24} />
          <p className="text-sm text-slate-600">
            Drag and drop or{' '}
            <span className="text-orange-500 font-medium">browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG, SVG up to 2MB</p>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export const WhiteLabelSettings: React.FC<WhiteLabelSettingsProps> = ({
  organizationId,
}) => {
  const [branding, setBranding] = useState<BrandingSettings>({
    organizationId,
    primaryColor: '#3B82F6',
    secondaryColor: '#1E40AF',
    accentColor: '#F97316',
    hideBuiltWithBadge: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchBranding = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        buildApiUrl(`/revenue/branding/${organizationId}`),
      );
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setBranding((prev) => ({
            ...prev,
            ...data,
            primaryColor: data.primaryColor || '#3B82F6',
            secondaryColor: data.secondaryColor || '#1E40AF',
            accentColor: data.accentColor || '#F97316',
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch branding:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const saveBranding = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/revenue/branding/${organizationId}`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branding),
        },
      );

      if (response.ok) {
        const data = await response.json();
        setBranding(data);
        setNotification({
          type: 'success',
          message: 'Branding settings saved successfully!',
        });
      } else {
        const error = await response.json();
        setNotification({
          type: 'error',
          message: error.error || 'Failed to save branding settings',
        });
      }
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to save branding settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const verifyDomain = async () => {
    try {
      setVerifying(true);
      const response = await fetch(
        buildApiUrl(`/revenue/branding/${organizationId}/verify-domain`),
        {
          method: 'POST',
        },
      );

      if (response.ok) {
        const data = await response.json();
        setBranding({ ...branding, domainVerified: data.domainVerified });
        setNotification({
          type: 'success',
          message: 'Domain verified successfully!',
        });
      } else {
        setNotification({
          type: 'error',
          message:
            'Domain verification failed. Please check your DNS settings.',
        });
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Domain verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  const handleFileUpload = async (file: File, type: 'logo' | 'favicon') => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'logo') {
        setBranding({ ...branding, logoUrl: base64 });
      } else {
        setBranding({ ...branding, faviconUrl: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const updateField = <K extends keyof BrandingSettings>(
    field: K,
    value: BrandingSettings[K],
  ) => {
    setBranding({ ...branding, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in px-2 md:px-0">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {notification.message}
        </div>
      )}

      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">
              White-Label Branding
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
            Brand Customization
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base">
            Customize your platform's look and feel
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Shield size={16} className="text-emerald-400" />
              <span>Premium Feature</span>
            </div>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Zap size={16} className="text-amber-400" />
              <span>Full Customization</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PremiumCard className="p-4 md:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
              <Building2 className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Company Information
              </h3>
              <p className="text-sm text-slate-500">Basic branding details</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="whitelabel-company-name"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Company Name
              </label>
              <input
                id="whitelabel-company-name"
                type="text"
                value={branding.companyName || ''}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder="Your Company Name"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div>
              <label
                htmlFor="whitelabel-support-email"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Support Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  id="whitelabel-support-email"
                  type="email"
                  value={branding.supportEmail || ''}
                  onChange={(e) => updateField('supportEmail', e.target.value)}
                  placeholder="support@yourcompany.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-4 md:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
              <Globe className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Custom Domain
              </h3>
              <p className="text-sm text-slate-500">Use your own domain</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="whitelabel-domain-url"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Domain URL
              </label>
              <input
                id="whitelabel-domain-url"
                type="text"
                value={branding.customDomain || ''}
                onChange={(e) => updateField('customDomain', e.target.value)}
                placeholder="app.yourcompany.com"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                {branding.domainVerified ? (
                  <>
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                    <span className="text-sm font-medium text-emerald-700">
                      Domain Verified
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                    <span className="text-sm font-medium text-amber-700">
                      Pending Verification
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={verifyDomain}
                disabled={verifying || !branding.customDomain}
                className="px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-100 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {verifying ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                Verify
              </button>
            </div>

            <div className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
              <strong className="text-blue-800">DNS Setup:</strong> Add a CNAME
              record pointing to our servers before verification.
            </div>
          </div>
        </PremiumCard>
      </div>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
            <Image className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Logo & Favicon</h3>
            <p className="text-sm text-slate-500">Upload your brand assets</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FileUploadZone
            label="Company Logo"
            description="Recommended: 200x50px or larger, PNG with transparency"
            currentUrl={branding.logoUrl}
            onUpload={(file) => handleFileUpload(file, 'logo')}
            onClear={() => updateField('logoUrl', undefined)}
            previewSize="large"
          />

          <FileUploadZone
            label="Favicon"
            description="Recommended: 32x32px or 64x64px, ICO or PNG"
            currentUrl={branding.faviconUrl}
            onUpload={(file) => handleFileUpload(file, 'favicon')}
            onClear={() => updateField('faviconUrl', undefined)}
            previewSize="small"
          />
        </div>
      </PremiumCard>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
            <Palette className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Brand Colors</h3>
            <p className="text-sm text-slate-500">
              Customize your color scheme
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <ColorPicker
            label="Primary Color"
            description="Main brand color for headers and buttons"
            value={branding.primaryColor || '#3B82F6'}
            onChange={(value) => updateField('primaryColor', value)}
          />
          <ColorPicker
            label="Secondary Color"
            description="Accent elements and hover states"
            value={branding.secondaryColor || '#1E40AF'}
            onChange={(value) => updateField('secondaryColor', value)}
          />
          <ColorPicker
            label="Accent Color"
            description="Call-to-action and highlights"
            value={branding.accentColor || '#F97316'}
            onChange={(value) => updateField('accentColor', value)}
          />
        </div>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <p className="text-sm font-medium text-slate-700 mb-3">Preview</p>
          <div className="flex flex-wrap gap-3">
            <div
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: branding.primaryColor }}
            >
              Primary Button
            </div>
            <div
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: branding.secondaryColor }}
            >
              Secondary Button
            </div>
            <div
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: branding.accentColor }}
            >
              Accent Button
            </div>
          </div>
        </div>
      </PremiumCard>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
              {branding.hideBuiltWithBadge ? (
                <EyeOff className="text-white" size={20} />
              ) : (
                <Eye className="text-white" size={20} />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Built With Badge
              </h3>
              <p className="text-sm text-slate-500">
                Show or hide the platform attribution
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={branding.hideBuiltWithBadge || false}
              onChange={(e) =>
                updateField('hideBuiltWithBadge', e.target.checked)
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
          </label>
        </div>
        <p className="text-sm text-slate-600">
          {branding.hideBuiltWithBadge
            ? 'The "Built with" badge is currently hidden from your users.'
            : 'The "Built with" badge is visible to your users. Toggle to hide it.'}
        </p>
      </PremiumCard>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
            <Code className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Custom CSS</h3>
            <p className="text-sm text-slate-500">
              Advanced styling customization
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            value={branding.customCss || ''}
            onChange={(e) => updateField('customCss', e.target.value)}
            placeholder={`/* Add your custom CSS here */
.chat-widget {
  border-radius: 16px;
}

.chat-header {
  background: linear-gradient(135deg, #3B82F6, #1E40AF);
}`}
            rows={10}
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm resize-y bg-slate-900 text-slate-100"
          />
          <p className="text-xs text-slate-500">
            Custom CSS will be applied to your branded chat widgets and embedded
            components.
          </p>
        </div>
      </PremiumCard>

      <div className="flex flex-col sm:flex-row justify-end gap-3 pb-8">
        <button
          type="button"
          onClick={fetchBranding}
          className="px-6 py-3 text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw size={18} />
          Reset Changes
        </button>
        <button
          type="button"
          onClick={saveBranding}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          Save All Changes
        </button>
      </div>
    </div>
  );
};
