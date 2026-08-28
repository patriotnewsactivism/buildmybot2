import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface WalletDeductionRequest {
  agencyId: string;
  subAccountId: string;
  amountCents: number;
  idempotencyKey: string;
  description: string;
}

export interface WalletBalance {
  subAccountId: string;
  balanceCents: number;
  currency: string;
}

export class WalletManager {
  private static processedIdempotencyKeys = new Set<string>();
  private static mockBalances = new Map<string, number>();

  public static reset() {
    this.processedIdempotencyKeys.clear();
    this.mockBalances.clear();
  }

  public static setBalance(subAccountId: string, balanceCents: number) {
    this.mockBalances.set(subAccountId, balanceCents);
  }

  public static async deductBalance(
    req: WalletDeductionRequest,
    supabaseClient?: any
  ): Promise<{ success: boolean; remainingBalanceCents: number; error?: string }> {
    if (this.processedIdempotencyKeys.has(req.idempotencyKey)) {
      const current = this.mockBalances.get(req.subAccountId) ?? 0;
      return { success: true, remainingBalanceCents: current };
    }

    if (supabaseClient) {
      const { data, error } = await supabaseClient.rpc('deduct_subaccount_wallet', {
        p_agency_id: req.agencyId,
        p_subaccount_id: req.subAccountId,
        p_amount_cents: req.amountCents,
        p_idempotency_key: req.idempotencyKey,
        p_description: req.description,
      });
      if (error) {
        return { success: false, remainingBalanceCents: 0, error: error.message };
      }
      return { success: true, remainingBalanceCents: data?.remaining_balance ?? 0 };
    }

    const current = this.mockBalances.get(req.subAccountId) ?? 0;
    if (current < req.amountCents) {
      return { success: false, remainingBalanceCents: current, error: 'Insufficient wallet balance' };
    }

    const updated = current - req.amountCents;
    this.mockBalances.set(req.subAccountId, updated);
    this.processedIdempotencyKeys.add(req.idempotencyKey);
    return { success: true, remainingBalanceCents: updated };
  }

  public static async generateMonthlyInvoice(
    agencyId: string,
    subAccountId: string,
    billingPeriod: string,
    totalUsageCents: number,
    supabaseClient?: any
  ): Promise<{ invoiceId: string; status: string; totalAmountCents: number }> {
    const invoiceId = `inv_${agencyId}_${subAccountId}_${billingPeriod}`;
    if (supabaseClient) {
      await supabaseClient.from('agency_invoices').insert({
        id: invoiceId,
        agency_id: agencyId,
        subaccount_id: subAccountId,
        billing_period: billingPeriod,
        total_amount_cents: totalUsageCents,
        status: 'draft',
      });
    }
    return {
      invoiceId,
      status: 'draft',
      totalAmountCents: totalUsageCents,
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { agencyId, subAccountId, amountCents, idempotencyKey, description } = req.body || {};
  if (!agencyId || !subAccountId || typeof amountCents !== 'number' || !idempotencyKey) {
    return res.status(400).json({ error: 'Missing required deduction parameters' });
  }
  const result = await WalletManager.deductBalance({
    agencyId,
    subAccountId,
    amountCents,
    idempotencyKey,
    description: description || 'Usage deduction',
  });
  if (!result.success) {
    return res.status(402).json({ error: result.error, remainingBalanceCents: result.remainingBalanceCents });
  }
  return res.status(200).json(result);
}
