/**
 * Branding Settings Panel
 * Agency-facing UI for white-label customization.
 * Upload logo, set brand colors, configure custom domain, and preview live.
 */

import {
  Building2,
  Image as ImageIcon,
  Palette,
  Save,
  Upload,
  Globe,
  CheckCircle,
  Loader,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';

interface BrandingSettingsProps {
  organizationId: string;
}

interface BrandingData {
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  companyName?: string;
  supportEmail?: string;
  customDomain?: string;
  domainVerified?: boolean;
  hideBuiltWithBadge?: boolean;
}

const DEFAULT_COLORS = {
  primaryColor: '#3B82F6',
  secondaryColor: '#1E40AF',
  accentColor: '#F97316',
};

export const BrandingSettings: React.FC<BrandingSettingsProps> = ({ organizationId }) => {
  const [branding, setBranding] = useState<BrandingData>({ ...DEFAULT_COLORS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBranding();
  }, [organizationId]);

  const fetchBranding = async () => {
    try {
      const res = await fetch(buildApiUrl(`/branding/${organizationId}`));
      if (res.ok) {
        const data = await res.json();
        if (data) setBranding({ ...DEFAULT_COLORS, ...data });
      }
    } catch (err) {
      console.error('Failed to load branding:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`/branding/${organizationId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      if (!res.ok) throw new Error('Failed to save branding');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organizationId', organizationId);
      formData.append('type', 'logo');

      const res = await fetch(buildApiUrl('/branding/upload'), {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setBranding((prev) => ({ ...prev, logoUrl: data.url }));
    } catch (err) {
      setError('Failed to upload logo. Make sure your plan includes white-label.');
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!branding.customDomain) return;
    try {
      const res = await fetch(
        buildApiUrl(`/branding/${organizationId}/verify-domain`),
        { method: 'POST' }
      );
      if (res.ok) {
        setBranding((prev) => ({ ...prev, domainVerified: true }));
      }
    } catch (err) {
      setError('Domain verification failed. Check DNS records.');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader className="animate-spin h-6 w-6 text-blue-500" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="h-6 w-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-slate-900">White-Label Branding</h2>
      </div>
      <p className="text-slate-600 -mt-4">
        Customize the platform with your agency's logo, colors, and domain. Changes apply instantly.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle className="h-4 w-4" /> Branding saved! Changes are live.
        </div>
      )}

      {/* Logo Upload */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Logo</h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <ImageIcon className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                {uploading ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
              />
            </label>
            <p className="text-xs text-slate-500 mt-2">PNG, JPG, or SVG. Recommended: 200x200px.</p>
          </div>
        </div>
      </section>

      {/* Brand Colors */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Brand Colors</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Primary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primaryColor || '#3B82F6'}
                onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                className="h-10 w-12 rounded border border-slate-300 cursor-pointer"
              />
              <Input
                value={branding.primaryColor || ''}
                onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                placeholder="#3B82F6"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Secondary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.secondaryColor || '#1E40AF'}
                onChange={(e) => setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                className="h-10 w-12 rounded border border-slate-300 cursor-pointer"
              />
              <Input
                value={branding.secondaryColor || ''}
                onChange={(e) => setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                placeholder="#1E40AF"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Accent</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.accentColor || '#F97316'}
                onChange={(e) => setBranding((prev) => ({ ...prev, accentColor: e.target.value }))}
                className="h-10 w-12 rounded border border-slate-300 cursor-pointer"
              />
              <Input
                value={branding.accentColor || ''}
                onChange={(e) => setBranding((prev) => ({ ...prev, accentColor: e.target.value }))}
                placeholder="#F97316"
              />
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Eye className="h-3 w-3" /> Live Preview</p>
          <div className="flex items-center gap-3">
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
              Secondary
            </div>
            <div
              className="px-4 py-2 rounded-lg text-sm font-medium border-2"
              style={{ borderColor: branding.accentColor, color: branding.accentColor }}
            >
              Accent Outline
            </div>
          </div>
        </div>
      </section>

      {/* Company Info */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Company Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Company Name</label>
            <Input
              value={branding.companyName || ''}
              onChange={(e) => setBranding((prev) => ({ ...prev, companyName: e.target.value }))}
              placeholder="Your Agency Name"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Support Email</label>
            <Input
              type="email"
              value={branding.supportEmail || ''}
              onChange={(e) => setBranding((prev) => ({ ...prev, supportEmail: e.target.value }))}
              placeholder="support@youragency.com"
            />
          </div>
        </div>
      </section>

      {/* Custom Domain */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Custom Domain</h3>
        </div>
        <div className="flex items-center gap-3">
          <Input
            value={branding.customDomain || ''}
            onChange={(e) => setBranding((prev) => ({ ...prev, customDomain: e.target.value }))}
            placeholder="app.youragency.com"
          />
          {branding.domainVerified ? (
            <span className="flex items-center gap-1 text-green-600 text-sm whitespace-nowrap">
              <CheckCircle className="h-4 w-4" /> Verified
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={handleVerifyDomain}>Verify</Button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Add a CNAME record pointing to <code className="text-slate-700">branding.buildmybot.app</code> then click Verify.
        </p>
      </section>

      {/* Hide "Built With" Badge */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={branding.hideBuiltWithBadge || false}
            onChange={(e) => setBranding((prev) => ({ ...prev, hideBuiltWithBadge: e.target.checked }))}
            className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <p className="font-medium text-slate-900">Hide "Built with BuildMyBot" badge</p>
            <p className="text-sm text-slate-500">Remove all BuildMyBot branding from your white-labeled platform.</p>
          </div>
        </label>
      </section>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchBranding}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Saving...' : 'Save Branding'}
        </Button>
      </div>
    </div>
  );
};

export default BrandingSettings;
