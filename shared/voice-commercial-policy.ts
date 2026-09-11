import { PLANS, VOICE_PLANS } from '../constants.js';
import type { VoiceDepartment } from './voice-team.js';

export const RETENTION_OBJECTIONS = [
  'price',
  'competitor',
  'trust',
  'timing',
  'implementation',
  'missing_capability',
  'service_issue',
  'cancellation_risk',
  'other',
] as const;
export type RetentionObjection = (typeof RETENTION_OBJECTIONS)[number];

export const RETENTION_OFFER_STAGES = [
  'light',
  'moderate',
  'strong',
  'maximum',
] as const;
export type RetentionOfferStage = (typeof RETENTION_OFFER_STAGES)[number];
export type RetentionCurrentStage = 'none' | 'value_only' | RetentionOfferStage;

const OFFER_MULTIPLIERS: Record<RetentionOfferStage, number> = {
  light: 0.85,
  moderate: 0.7,
  strong: 0.5,
  maximum: 0.33,
};

export const MINIMUM_PRICE_MULTIPLIER = 0.33;
export const MAXIMUM_INCENTIVE_MONTHS = 2;

export class RetentionPolicyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetentionPolicyViolation';
  }
}

export interface CommercialPlan {
  key: string;
  name: string;
  listedMonthlyPrice: number;
  family: 'platform' | 'voice';
}

export interface RetentionAuditEntry {
  timestamp: string;
  planKey: string;
  planName: string;
  objection: RetentionObjection;
  listedMonthlyPrice: number;
  offerStage: RetentionOfferStage;
  temporaryMonthlyPrice: number;
  temporaryMonths: number;
  reason: string;
  competitorName?: string;
  desiredOutcome?: string;
  accepted: boolean | null;
  outcomeNote?: string;
}

export interface RetentionState {
  currentStage: RetentionCurrentStage;
  planKey?: string;
  offers: RetentionAuditEntry[];
}

export interface RetentionOfferRequest {
  department: VoiceDepartment;
  state: RetentionState;
  planId: string;
  objection: RetentionObjection;
  months: number;
  reason: string;
  valueDefended: boolean;
  conditionalCommitment: boolean;
  competitorName?: string;
  desiredOutcome?: string;
}

export interface RetentionOfferPublicResult {
  planName: string;
  temporaryMonthlyPrice: number;
  temporaryMonths: number;
  standardMonthlyPrice: number;
  disclosure: string;
}

export function createRetentionState(): RetentionState {
  return { currentStage: 'none', offers: [] };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function catalog(): CommercialPlan[] {
  const platform = Object.entries(PLANS).map(([key, plan]) => ({
    key,
    name: plan.name,
    listedMonthlyPrice: plan.price,
    family: 'platform' as const,
  }));
  const voice = Object.entries(VOICE_PLANS).map(([key, plan]) => ({
    key,
    name: plan.name,
    listedMonthlyPrice: plan.price,
    family: 'voice' as const,
  }));
  return [...platform, ...voice];
}

export function resolveCommercialPlan(planId: string): CommercialPlan {
  const requested = normalize(planId);
  const plan = catalog().find(
    (candidate) =>
      normalize(candidate.key) === requested ||
      normalize(candidate.name) === requested,
  );
  if (!plan)
    throw new RetentionPolicyViolation(
      'The requested plan is not in the canonical pricing catalog.',
    );
  if (!(plan.listedMonthlyPrice > 0)) {
    throw new RetentionPolicyViolation(
      'Exceptional retention pricing cannot be issued for a zero-price plan.',
    );
  }
  return plan;
}

function nextStage(current: RetentionCurrentStage): RetentionOfferStage | null {
  if (current === 'none' || current === 'value_only') return 'light';
  const index = RETENTION_OFFER_STAGES.indexOf(current);
  return index >= 0 && index + 1 < RETENTION_OFFER_STAGES.length
    ? RETENTION_OFFER_STAGES[index + 1]
    : null;
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireManager(department: VoiceDepartment) {
  if (department !== 'manager') {
    throw new RetentionPolicyViolation(
      'Exceptional introductory incentives require manager authority.',
    );
  }
}

export function authorizeNextRetentionOffer(
  request: RetentionOfferRequest,
): RetentionOfferPublicResult {
  requireManager(request.department);
  if (!request.reason.trim())
    throw new RetentionPolicyViolation('A business reason is required.');
  if (!request.valueDefended) {
    throw new RetentionPolicyViolation(
      'Resolve or defend value before requesting an exceptional incentive.',
    );
  }
  if (
    !Number.isInteger(request.months) ||
    request.months < 1 ||
    request.months > MAXIMUM_INCENTIVE_MONTHS
  ) {
    throw new RetentionPolicyViolation(
      'Exceptional introductory pricing may last only 1 or 2 billing months.',
    );
  }

  const plan = resolveCommercialPlan(request.planId);
  if (request.state.planKey && request.state.planKey !== plan.key) {
    throw new RetentionPolicyViolation(
      'Do not switch plans mid-negotiation to bypass the authorized offer sequence.',
    );
  }

  const stage = nextStage(request.state.currentStage);
  if (!stage)
    throw new RetentionPolicyViolation(
      'Maximum authorized introductory incentive has already been reached.',
    );
  if (
    (stage === 'strong' || stage === 'maximum') &&
    !request.conditionalCommitment
  ) {
    throw new RetentionPolicyViolation(
      'Confirm that price is the remaining blocker before a stronger incentive.',
    );
  }

  const temporaryMonthlyPrice = cents(
    plan.listedMonthlyPrice * OFFER_MULTIPLIERS[stage],
  );
  const floor = cents(plan.listedMonthlyPrice * MINIMUM_PRICE_MULTIPLIER);
  if (temporaryMonthlyPrice < floor) {
    throw new RetentionPolicyViolation(
      'Requested incentive is below the authorized pricing floor.',
    );
  }

  request.state.planKey = plan.key;
  request.state.currentStage = stage;
  request.state.offers.push({
    timestamp: new Date().toISOString(),
    planKey: plan.key,
    planName: plan.name,
    objection: request.objection,
    listedMonthlyPrice: plan.listedMonthlyPrice,
    offerStage: stage,
    temporaryMonthlyPrice,
    temporaryMonths: request.months,
    reason: request.reason.trim().slice(0, 1000),
    ...(request.competitorName?.trim()
      ? { competitorName: request.competitorName.trim().slice(0, 200) }
      : {}),
    ...(request.desiredOutcome?.trim()
      ? { desiredOutcome: request.desiredOutcome.trim().slice(0, 500) }
      : {}),
    accepted: null,
  });

  return {
    planName: plan.name,
    temporaryMonthlyPrice,
    temporaryMonths: request.months,
    standardMonthlyPrice: plan.listedMonthlyPrice,
    disclosure: `${plan.name} can be offered at $${temporaryMonthlyPrice.toFixed(2)}/month for ${request.months} billing month${request.months === 1 ? '' : 's'}. After that introductory period, the standard price is $${plan.listedMonthlyPrice.toFixed(2)}/month.`,
  };
}

export function markLatestRetentionOfferOutcome(
  state: RetentionState,
  accepted: boolean,
  note = '',
): RetentionAuditEntry {
  const entry = [...state.offers]
    .reverse()
    .find((offer) => offer.accepted === null);
  if (!entry)
    throw new RetentionPolicyViolation(
      'No pending retention offer exists for this call.',
    );
  entry.accepted = accepted;
  if (note.trim()) entry.outcomeNote = note.trim().slice(0, 1000);
  return entry;
}

export function retentionAuditSnapshot(
  state: RetentionState,
): RetentionAuditEntry[] {
  return state.offers.map((offer) => ({ ...offer }));
}
