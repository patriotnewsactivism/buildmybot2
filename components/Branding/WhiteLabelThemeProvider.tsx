/**
 * White-Label Theme Provider
 * Fetches organization branding from the API and applies CSS variables,
 * logo, favicon, and company name dynamically. Agencies upload their
 * logo and set brand colors — this component makes it live instantly.
 */

import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface BrandingData {
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

interface WhiteLabelContextValue {
  branding: BrandingData | null;
  loading: boolean;
  refresh: () => void;
}

export const WhiteLabelContext = createContext<WhiteLabelContextValue>({
  branding: null,
  loading: true,
  refresh: () => {},
});

export const useWhiteLabel = () => useContext(WhiteLabelContext);

export const WhiteLabelThemeProvider: React.FC<{ children: React.ReactNode; organizationId?: string }> = ({
  children,
  organizationId,
}) => {
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(buildApiUrl(`/branding/${organizationId}`));
      if (res.ok) {
        const data = await res.json();
        setBranding(data);
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

  // Apply CSS variables when branding changes
  useEffect(() => {
    if (!branding) return;

    const root = document.documentElement;

    if (branding.primaryColor) {
      root.style.setProperty('--brand-primary', branding.primaryColor);
    }
    if (branding.secondaryColor) {
      root.style.setProperty('--brand-secondary', branding.secondaryColor);
    }
    if (branding.accentColor) {
      root.style.setProperty('--brand-accent', branding.accentColor);
    }

    // Apply logo to all [data-brand-logo] elements
    if (branding.logoUrl) {
      const logos = document.querySelectorAll('[data-brand-logo]');
      logos.forEach((el) => {
        (el as HTMLImageElement).src = branding.logoUrl!;
        (el as HTMLImageElement).style.display = 'block';
      });
    }

    // Apply favicon
    if (branding.faviconUrl) {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = branding.faviconUrl;
    }

    // Apply company name to document title
    if (branding.companyName) {
      document.title = branding.companyName;
    }

    // Apply custom CSS
    if (branding.customCss) {
      let styleEl = document.getElementById('whitelabel-custom-css') as HTMLStyleElement;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'whitelabel-custom-css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = branding.customCss;
    }

    // Toggle "Built with" badge visibility
    if (branding.hideBuiltWithBadge) {
      document.body.classList.add('hide-built-with-badge');
    } else {
      document.body.classList.remove('hide-built-with-badge');
    }
  }, [branding]);

  return (
    <WhiteLabelContext.Provider value={{ branding, loading, refresh: fetchBranding }}>
      {children}
    </WhiteLabelContext.Provider>
  );
};

export default WhiteLabelThemeProvider;
