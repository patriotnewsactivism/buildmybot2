import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Automated monthly invoice generation and agency sub-account wallet metering.
 */

export interface WalletBalance {
  organizationId: string;
  balanceCents: number;
  currency: string;
  autoReload: boolean;
  reloadThresholdCents: number;
  reloadAmountCents: number;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  subAccountId?: string;
  serviceType: 'llm_tokens' | 'voice_seconds' | 'sms_segments' | 'vector_rag';
  units: number;
  costCents: number;
  timestamp: string;
}

export interface InvoiceSummary {
  invoiceId: string;
  organizationId: string;
  billingPeriod: string;
  subAccountBreakdown: Record<string, number>;
  totalCents: number;
  status: 'draft' | 'paid' | 'uncollectible';
}

export function calculateUsageCost(serviceType: UsageRecord['serviceType'], units: number): number {
  switch (serviceType) {
    case 'llm_tokens':
      // $0.002 per 1k tokens = 0.2 cents per 1k
      return Math.ceil((units / 1000) * 0.2);
    case 'voice_seconds':
      // $0.05 per min = 5 cents per 60s
      return Math.ceil((units / 60) * 5);
    case 'sms_segments':
      // $0.015 per segment = 1.5 cents
      return Math.ceil(units * 1.5);
    case 'vector_rag':
      // $0.0001 per query = 0.01 cents
      return Math.ceil(units * 0.01);
    default:
      return 0;
  }
}

export function meterUsage(currentBalanceCents: number, costCents: number): { allowed: boolean; remainingBalanceCents: number; triggerReload: boolean; thresholdCents: number } {
  const remaining = currentBalanceCents - costCents;
  return {
    allowed: remaining >= 0,
    remainingBalanceCents: remaining,
    triggerReload: remaining < 1000, // < $10 trigger threshold
    thresholdCents: 1000,
  };
}

export function generateMonthlyInvoice(organizationId: string, period: string, records: UsageRecord[]): InvoiceSummary {
  const breakdown: Record<string, number> = {};
  let totalCents = 0;

  for (const rec of records) {
    const key = rec.subAccountId || 'primary';
    breakdown[key] = (breakdown[key] || 0) + rec.costCents;
    totalCents += rec.costCents;
  }

  return {
    invoiceId: `inv_${organizationId}_${period.replace(/[^a-zA-Z0-9]/g, '')}`,
    organizationId,
    billingPeriod: period,
    subAccountBreakdown: breakdown,
    totalCents,
    status: 'paid',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Wallet Metering active' });
  }

  const { action, balanceCents, costCents, serviceType, units, organizationId, period, records } = req.body || {};

  if (action === 'calculate') {
    const cost = calculateUsageCost(serviceType, units || 0);
    return res.status(200).json({ costCents: cost });
  }

  if (action === 'meter') {
    const result = meterUsage(balanceCents || 0, costCents || 0);
    return res.status(200).json(result);
  }

  if (action === 'invoice') {
    const invoice = generateMonthlyInvoice(organizationId || 'org_default', period || new Date().toISOString().slice(0, 7), records || []);
    return res.status(200).json(invoice);
  }

  return res.status(200).json({ status: 'Wallet Metering active' });
}
