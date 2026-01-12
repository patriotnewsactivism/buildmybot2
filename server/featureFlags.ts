/**
 * Feature Flags System
 * Controls feature rollout and A/B testing
 */

import type { NextFunction, Request, Response } from 'express';
import { env } from './env';

export interface FeatureFlags {
  MULTI_TENANT: boolean;
  VOICE_AGENT: boolean;
  ADVANCED_ANALYTICS: boolean;
  AB_TESTING: boolean;
  BOT_TEMPLATES_MARKETPLACE: boolean;
  CLIENT_DASHBOARD: boolean;
  SIMPLIFIED_BOT_WIZARD: boolean;
  MULTI_CHANNEL: boolean;
  GPT5O_MINI: boolean;
  REDIS_CACHE: boolean;
  REAL_TIME_METRICS: boolean;
  PARTNER_IMPERSONATION: boolean;
}

// Parse environment variable as boolean
const parseEnvBool = (
  value: string | undefined,
  defaultValue = false,
): boolean => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

// Feature flags configuration
export const FEATURES: FeatureFlags = {
  // Core features - enabled by default
  MULTI_TENANT: parseEnvBool(env.FEATURE_MULTI_TENANT, true),
  PARTNER_IMPERSONATION: parseEnvBool(env.FEATURE_PARTNER_IMPERSONATION, true),

  // Voice and communication
  VOICE_AGENT: parseEnvBool(env.FEATURE_VOICE_AGENT, true),
  MULTI_CHANNEL: parseEnvBool(env.FEATURE_MULTI_CHANNEL, false),

  // Analytics and metrics
  ADVANCED_ANALYTICS: parseEnvBool(env.FEATURE_ADVANCED_ANALYTICS, true),
  REAL_TIME_METRICS: parseEnvBool(env.FEATURE_REAL_TIME_METRICS, false),

  // Bot building experience
  BOT_TEMPLATES_MARKETPLACE: parseEnvBool(env.FEATURE_BOT_TEMPLATES, true),
  SIMPLIFIED_BOT_WIZARD: parseEnvBool(env.FEATURE_SIMPLIFIED_WIZARD, true),
  AB_TESTING: parseEnvBool(env.FEATURE_AB_TESTING, false),

  // Dashboard features
  CLIENT_DASHBOARD: parseEnvBool(env.FEATURE_CLIENT_DASHBOARD, true),

  // Infrastructure
  REDIS_CACHE: parseEnvBool(env.FEATURE_REDIS_CACHE, false),

  // AI Models
  GPT5O_MINI: parseEnvBool(env.FEATURE_GPT5O_MINI, true),
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return FEATURES[feature] ?? false;
}

/**
 * Check if a feature is enabled for a specific user (for gradual rollout)
 */
export function isFeatureEnabledForUser(
  feature: keyof FeatureFlags,
  userId: string,
  rolloutPercentage = 100,
): boolean {
  // If feature is disabled globally, return false
  if (!FEATURES[feature]) return false;

  // If 100% rollout, return true
  if (rolloutPercentage >= 100) return true;

  // Use user ID to deterministically decide rollout
  // This ensures the same user always gets the same result
  const hash = userId.split('').reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);

  const userPercentile = Math.abs(hash % 100);
  return userPercentile < rolloutPercentage;
}

/**
 * Get all feature flags for client-side use
 */
export function getClientFeatureFlags(): Partial<FeatureFlags> {
  // Return only client-safe features
  return {
    VOICE_AGENT: FEATURES.VOICE_AGENT,
    ADVANCED_ANALYTICS: FEATURES.ADVANCED_ANALYTICS,
    BOT_TEMPLATES_MARKETPLACE: FEATURES.BOT_TEMPLATES_MARKETPLACE,
    SIMPLIFIED_BOT_WIZARD: FEATURES.SIMPLIFIED_BOT_WIZARD,
    CLIENT_DASHBOARD: FEATURES.CLIENT_DASHBOARD,
    MULTI_CHANNEL: FEATURES.MULTI_CHANNEL,
    AB_TESTING: FEATURES.AB_TESTING,
  };
}

/**
 * Feature flag middleware for Express
 */
export function requireFeature(feature: keyof FeatureFlags) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!isFeatureEnabled(feature)) {
      return res.status(404).json({
        error: 'Feature not available',
        feature,
      });
    }
    next();
  };
}
