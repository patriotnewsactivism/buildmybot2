import { z } from 'zod';
import type { VoiceDepartment } from './voice-team.js';
import {
  RETENTION_OBJECTIONS,
  type RetentionObjection,
} from './voice-commercial-policy.js';

/**
 * Workspace-scoped Support Manager incentive playbook.
 *
 * Grants are pre-approved tier/offer codes with hard caps — never open-ended
 * discounts. Authorization is fail-closed: missing objection tag or missing
 * value-pitch attempt always refuses.
 */

export const INCENTIVE_OBJECTION_TAGS = RETENTION_OBJECTIONS;
export type IncentiveObjectionTag = RetentionObjection;

export class IncentivePolicyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncentivePolicyViolation';
  }
}

export const incentiveOfferSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[A-Z0-9_]+$/, 'Offer codes must be uppercase alphanumeric/underscore'),
    label: z.string().trim().min(2).max(120),
    maxPercentOff: z.number().min(0).max(100),
    freeMonths: z.number().int().min(0).max(6),
  })
  .strict();

export type IncentiveOffer = z.infer<typeof incentiveOfferSchema>;

export const workspaceIncentiveConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxPercentOff: z.number().min(0).max(100),
    freeMonthCeiling: z.number().int().min(0).max(6),
    offers: z.array(incentiveOfferSchema).min(1).max(32),
  })
  .strict()
  .superRefine((config, ctx) => {
    const codes = new Set<string>();
    for (const offer of config.offers) {
      if (codes.has(offer.code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['offers'],
          message: `Duplicate offer code: ${offer.code}`,
        });
      }
      codes.add(offer.code);
      if (offer.maxPercentOff > config.maxPercentOff) {
        ctx.addIssue({
          code: 'custom',
          path: ['offers'],
          message: `Offer ${offer.code} exceeds workspace maxPercentOff (${config.maxPercentOff}).`,
        });
      }
      if (offer.freeMonths > config.freeMonthCeiling) {
        ctx.addIssue({
          code: 'custom',
          path: ['offers'],
          message: `Offer ${offer.code} exceeds workspace freeMonthCeiling (${config.freeMonthCeiling}).`,
        });
      }
    }
  });

export type WorkspaceIncentiveConfig = z.infer<
  typeof workspaceIncentiveConfigSchema
>;

/** Safe defaults used when a workspace has no custom playbook saved. */
export function defaultWorkspaceIncentiveConfig(): WorkspaceIncentiveConfig {
  return workspaceIncentiveConfigSchema.parse({
    enabled: true,
    maxPercentOff: 25,
    freeMonthCeiling: 1,
    offers: [
      {
        code: 'VALUE_10',
        label: '10% off for 1 billing cycle',
        maxPercentOff: 10,
        freeMonths: 0,
      },
      {
        code: 'VALUE_15',
        label: '15% off for 1 billing cycle',
        maxPercentOff: 15,
        freeMonths: 0,
      },
      {
        code: 'SAVE_20',
        label: '20% off for 1 billing cycle',
        maxPercentOff: 20,
        freeMonths: 0,
      },
      {
        code: 'FREE_MONTH_1',
        label: '1 free month then standard pricing',
        maxPercentOff: 0,
        freeMonths: 1,
      },
      {
        code: 'COMBO_10_PLUS_MONTH',
        label: '10% off plus 1 free month',
        maxPercentOff: 10,
        freeMonths: 1,
      },
    ],
  });
}

export function parseWorkspaceIncentiveConfig(
  raw: unknown,
): WorkspaceIncentiveConfig {
  if (raw == null) return defaultWorkspaceIncentiveConfig();
  return workspaceIncentiveConfigSchema.parse(raw);
}

export interface GrantIncentiveRequest {
  department: VoiceDepartment;
  /** Must be a known objection tag — fail closed when missing/unknown. */
  objectionTag: string | null | undefined;
  /** Must be true after a documented value-pitch attempt. */
  valuePitchAttempted: boolean;
  offerCode: string;
  /** Optional request within the selected offer's caps; defaults to offer max. */
  percentOff?: number;
  freeMonths?: number;
  reason: string;
  config: WorkspaceIncentiveConfig;
}

export interface GrantIncentiveResult {
  offerCode: string;
  label: string;
  percentOff: number;
  freeMonths: number;
  objectionTag: IncentiveObjectionTag;
  terms: string;
  smsBody: string;
}

function requireManager(department: VoiceDepartment) {
  if (department !== 'manager') {
    throw new IncentivePolicyViolation(
      'Incentive grants require Support Manager authority.',
    );
  }
}

function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function authorizeGrantIncentive(
  request: GrantIncentiveRequest,
): GrantIncentiveResult {
  requireManager(request.department);

  if (!request.config.enabled) {
    throw new IncentivePolicyViolation(
      'Incentive grants are disabled for this workspace.',
    );
  }

  const objectionRaw = String(request.objectionTag || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!objectionRaw) {
    throw new IncentivePolicyViolation(
      'An objection tag is required before granting an incentive.',
    );
  }
  if (
    !INCENTIVE_OBJECTION_TAGS.includes(objectionRaw as IncentiveObjectionTag)
  ) {
    throw new IncentivePolicyViolation(
      'Unknown objection tag. Use a supported retention objection tag.',
    );
  }
  const objectionTag = objectionRaw as IncentiveObjectionTag;

  if (request.valuePitchAttempted !== true) {
    throw new IncentivePolicyViolation(
      'A value-pitch attempt is required before granting an incentive.',
    );
  }

  if (!request.reason.trim()) {
    throw new IncentivePolicyViolation(
      'A business reason is required for every incentive grant.',
    );
  }

  const offerCode = normalizeOfferCode(request.offerCode || '');
  const offer = request.config.offers.find((entry) => entry.code === offerCode);
  if (!offer) {
    throw new IncentivePolicyViolation(
      'Offer code is not in the workspace incentive playbook.',
    );
  }

  const percentOff =
    request.percentOff === undefined
      ? offer.maxPercentOff
      : Number(request.percentOff);
  const freeMonths =
    request.freeMonths === undefined
      ? offer.freeMonths
      : Number(request.freeMonths);

  if (!Number.isFinite(percentOff) || percentOff < 0) {
    throw new IncentivePolicyViolation('percentOff must be a non-negative number.');
  }
  if (!Number.isInteger(freeMonths) || freeMonths < 0) {
    throw new IncentivePolicyViolation('freeMonths must be a non-negative integer.');
  }
  if (percentOff > offer.maxPercentOff || percentOff > request.config.maxPercentOff) {
    throw new IncentivePolicyViolation(
      'Requested percent off exceeds the authorized workspace/offer cap.',
    );
  }
  if (
    freeMonths > offer.freeMonths ||
    freeMonths > request.config.freeMonthCeiling
  ) {
    throw new IncentivePolicyViolation(
      'Requested free months exceed the authorized workspace/offer ceiling.',
    );
  }
  if (percentOff === 0 && freeMonths === 0) {
    throw new IncentivePolicyViolation(
      'Incentive must include a percent off and/or free months.',
    );
  }

  const parts: string[] = [];
  if (percentOff > 0) parts.push(`${percentOff}% off`);
  if (freeMonths > 0) {
    parts.push(
      `${freeMonths} free month${freeMonths === 1 ? '' : 's'}`,
    );
  }
  const terms = `${offer.label}: ${parts.join(' + ')} (offer code ${offer.code}). Standard pricing resumes after the introductory period.`;
  const smsBody = `BuildMyBot offer ${offer.code}: ${parts.join(' + ')}. ${offer.label}. Reply STOP to opt out.`;

  return {
    offerCode: offer.code,
    label: offer.label,
    percentOff,
    freeMonths,
    objectionTag,
    terms,
    smsBody,
  };
}
