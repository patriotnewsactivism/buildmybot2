import {
  AlertCircle,
  CheckCircle,
  DollarSign,
  Percent,
  RefreshCw,
  Save,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MetricCard } from '../../UI/MetricCard';
import { buildApiUrl } from '../../../services/apiConfig';

interface PricingTier {
  id: string;
  wholesaleVoicePerMinute: number;
  retailVoicePerMinute: number;
  wholesaleTokensPer1k: number;
  retailTokensPer1k: number;
  maxMarkupPercentage: number;
}

interface PricingConfig {
  tier: PricingTier;
  estimatedMonthlyProfit: number;
  averageClientUsage: {
    voiceMinutes: number;
    chatTokens: number;
  };
}

const defaultTier: PricingTier = {
  id: '',
  wholesaleVoicePerMinute: 0.1,
  retailVoicePerMinute: 0.2,
  wholesaleTokensPer1k: 0.02,
  retailTokensPer1k: 0.04,
  maxMarkupPercentage: 25.0,
};

export const PricingConfigurator: React.FC = () => {
  const [tier, setTier] = useState<PricingTier>(defaultTier);
  const [tempTier, setTempTier] = useState<PricingTier>(defaultTier);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchPricingConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('/agency/pricing'));
      if (!response.ok) throw new Error('Failed to fetch pricing');

      const data = await response.json();
      const currentTier = data.tier || defaultTier;
      setTier(currentTier);
      setTempTier(currentTier);
      setHasChanges(false);
    } catch (err) {
      console.error('Error fetching pricing:', err);
      setTier(defaultTier);
      setTempTier(defaultTier);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPricingConfig();
  }, [fetchPricingConfig]);

  useEffect(() => {
    const changed =
      tempTier.retailVoicePerMinute !== tier.retailVoicePerMinute ||
      tempTier.retailTokensPer1k !== tier.retailTokensPer1k;
    setHasChanges(changed);
  }, [tempTier, tier]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl('/agency/pricing'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailVoicePerMinute: tempTier.retailVoicePerMinute,
          retailTokensPer1k: tempTier.retailTokensPer1k,
        }),
      });

      if (!response.ok) throw new Error('Failed to save pricing');

      await fetchPricingConfig();
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save pricing configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTempTier(tier);
    setHasChanges(false);
  };

  const calculateMarkup = (wholesale: number, retail: number) => {
    if (wholesale === 0) return 0;
    return ((retail - wholesale) / wholesale) * 100;
  };

  const voiceMarkup = calculateMarkup(
    tier.wholesaleVoicePerMinute,
    tempTier.retailVoicePerMinute,
  );

  const tokenMarkup = calculateMarkup(
    tier.wholesaleTokensPer1k,
    tempTier.retailTokensPer1k,
  );

  const voiceProfit =
    tempTier.retailVoicePerMinute - tier.wholesaleVoicePerMinute;
  const tokenProfit = tempTier.retailTokensPer1k - tier.wholesaleTokensPer1k;

  const markupValid = voiceMarkup <= tier.maxMarkupPercentage;
  const tokenMarkupValid = tokenMarkup <= tier.maxMarkupPercentage;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Pricing Configuration
        </h2>
        <button
          type="button"
          onClick={fetchPricingConfig}
          disabled={loading}
          className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Pricing Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={DollarSign}
          label="Voice Profit per Min"
          value={`$${voiceProfit.toFixed(4)}`}
          loading={loading}
          status={markupValid ? 'healthy' : 'warning'}
        />
        <MetricCard
          icon={Percent}
          label="Voice Markup"
          value={`${voiceMarkup.toFixed(1)}%`}
          loading={loading}
          status={markupValid ? 'healthy' : 'warning'}
        />
        <MetricCard
          icon={DollarSign}
          label="Token Profit per 1k"
          value={`$${tokenProfit.toFixed(4)}`}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Max Markup Allowed"
          value={`${tier.maxMarkupPercentage.toFixed(0)}%`}
          loading={loading}
        />
      </div>

      {/* Markup Warning */}
      {(!markupValid || !tokenMarkupValid) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-red-900">
              Markup Exceeds Limit
            </p>
            <p className="text-xs text-red-700 mt-1">
              Your current markup exceeds the maximum allowed{' '}
              {tier.maxMarkupPercentage.toFixed(0)}%. Please adjust your retail
              pricing.
            </p>
          </div>
        </div>
      )}

      {/* Voice Pricing */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center space-x-2">
          <DollarSign size={20} className="text-emerald-600" />
          <span>Voice Call Pricing</span>
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="wholesale-voice-cost"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Wholesale Cost (Platform)
              </label>
              <div className="relative">
                <DollarSign
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="wholesale-voice-cost"
                  type="number"
                  value={tier.wholesaleVoicePerMinute}
                  disabled
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Per minute (fixed)</p>
            </div>

            <div>
              <label
                htmlFor="retail-voice-price"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Retail Price (Your Rate)
              </label>
              <div className="relative">
                <DollarSign
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="retail-voice-price"
                  type="number"
                  value={tempTier.retailVoicePerMinute}
                  onChange={(e) =>
                    setTempTier((prev) => ({
                      ...prev,
                      retailVoicePerMinute:
                        Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  step="0.01"
                  min={tier.wholesaleVoicePerMinute}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Per minute (editable)
              </p>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-emerald-900">
                  Profit per Minute
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Markup: {voiceMarkup.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-700">
                  ${voiceProfit.toFixed(4)}
                </p>
                <p className="text-xs text-emerald-600">
                  Example: 100 min = ${(voiceProfit * 100).toFixed(2)} profit
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Token Pricing */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center space-x-2">
          <DollarSign size={20} className="text-blue-600" />
          <span>Chat Token Pricing</span>
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="wholesale-token-cost"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Wholesale Cost (Platform)
              </label>
              <div className="relative">
                <DollarSign
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="wholesale-token-cost"
                  type="number"
                  value={tier.wholesaleTokensPer1k}
                  disabled
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Per 1,000 tokens (fixed)
              </p>
            </div>

            <div>
              <label
                htmlFor="retail-token-price"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Retail Price (Your Rate)
              </label>
              <div className="relative">
                <DollarSign
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="retail-token-price"
                  type="number"
                  value={tempTier.retailTokensPer1k}
                  onChange={(e) =>
                    setTempTier((prev) => ({
                      ...prev,
                      retailTokensPer1k: Number.parseFloat(e.target.value) || 0,
                    }))
                  }
                  step="0.01"
                  min={tier.wholesaleTokensPer1k}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Per 1,000 tokens (editable)
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Profit per 1,000 Tokens
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Markup: {tokenMarkup.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-700">
                  ${tokenProfit.toFixed(4)}
                </p>
                <p className="text-xs text-blue-600">
                  Example: 100k tokens = ${(tokenProfit * 100).toFixed(2)}{' '}
                  profit
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save/Reset Actions */}
      {hasChanges && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="text-orange-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-slate-900">
                Unsaved Changes
              </p>
              <p className="text-xs text-slate-600">
                You have modified your pricing configuration
              </p>
            </div>
          </div>
          <div className="flex space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 sm:flex-none px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !markupValid || !tokenMarkupValid}
              className="flex-1 sm:flex-none px-6 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {!hasChanges && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start space-x-2">
          <CheckCircle className="text-emerald-600 flex-shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-emerald-900">
              Configuration Saved
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Your pricing is active and will be applied to all new usage events
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
