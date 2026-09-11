/**
 * Deepgram Voice Agent tool declarations and server-side executors.
 * Speculative/irreversible tools should set defer_until_eot at the call site.
 */

import { PLANS } from '../../constants.js';
import { sendSms, transferCall } from '../lib/telephony-provider.js';

export interface DeepgramToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface DeepgramToolContext {
  callControlId: string;
  callerNumber?: string;
  calledNumber?: string;
  botName?: string;
}

export function getToolDeclarationsForDeepgram(): DeepgramToolDeclaration[] {
  return [
    {
      name: 'quote_discounted_plan',
      description:
        'Quote a BuildMyBot plan and an optional promotional monthly price for the caller.',
      parameters: {
        type: 'object',
        properties: {
          plan_key: {
            type: 'string',
            description:
              'Plan key such as free, starter, professional, executive, or enterprise.',
          },
          discount_percent: {
            type: 'number',
            description:
              'Optional promotional discount percent between 0 and 40.',
          },
        },
        required: ['plan_key'],
      },
    },
    {
      name: 'send_checkout_link',
      description:
        'Text the caller a billing/checkout link so they can subscribe.',
      parameters: {
        type: 'object',
        properties: {
          plan_key: {
            type: 'string',
            description: 'Plan the caller wants to buy.',
          },
          to_number: {
            type: 'string',
            description:
              'Destination phone for the SMS. Defaults to the caller number.',
          },
        },
        required: ['plan_key'],
      },
    },
    {
      name: 'transfer_to_owner',
      description:
        'Transfer the live call to the owner escalation number for urgent issues.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Short reason for the escalation.',
          },
        },
        required: ['reason'],
      },
    },
  ];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolvePlan(planKey: string): {
  key: string;
  name: string;
  price: number;
} | null {
  const normalized = planKey.trim().toLowerCase();
  const entry = Object.entries(PLANS).find(
    ([key, plan]) =>
      key.toLowerCase() === normalized ||
      plan.name.toLowerCase() === normalized,
  );
  if (!entry) return null;
  const [key, plan] = entry;
  return { key, name: plan.name, price: plan.price };
}

function checkoutUrl(planKey: string): string {
  const base = (process.env.APP_BASE_URL || 'https://www.buildmybot.app').replace(
    /\/$/,
    '',
  );
  return `${base}/billing?plan=${encodeURIComponent(planKey)}`;
}

export async function executeServerTool(
  name: string,
  args: Record<string, unknown>,
  context: DeepgramToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'quote_discounted_plan': {
      const plan = resolvePlan(asString(args.plan_key));
      if (!plan) {
        return {
          ok: false,
          error: 'Unknown plan. Use free, starter, professional, executive, or enterprise.',
        };
      }
      const discountRaw = asNumber(args.discount_percent) ?? 0;
      const discountPercent = Math.max(0, Math.min(40, discountRaw));
      const promotionalPrice = Math.round(
        plan.price * (1 - discountPercent / 100),
      );
      return {
        ok: true,
        plan_key: plan.key,
        plan_name: plan.name,
        listed_monthly_price: plan.price,
        discount_percent: discountPercent,
        promotional_monthly_price: promotionalPrice,
        disclosure:
          discountPercent > 0
            ? `${plan.name} is normally $${plan.price}/mo; promotional quote $${promotionalPrice}/mo (${discountPercent}% off). Final price is confirmed at checkout.`
            : `${plan.name} is $${plan.price}/mo. Final price is confirmed at checkout.`,
      };
    }
    case 'send_checkout_link': {
      const plan = resolvePlan(asString(args.plan_key));
      if (!plan) {
        return { ok: false, error: 'Unknown plan for checkout link.' };
      }
      const to =
        asString(args.to_number) || asString(context.callerNumber) || '';
      if (!to) {
        return { ok: false, error: 'No destination number for checkout SMS.' };
      }
      const link = checkoutUrl(plan.key);
      const sent = await sendSms({
        to,
        from: context.calledNumber || undefined,
        text: `BuildMyBot ${plan.name} checkout: ${link}`,
      });
      return {
        ok: true,
        plan_key: plan.key,
        message_id: sent.id,
        link,
      };
    }
    case 'transfer_to_owner': {
      const destination = (process.env.VOICE_OWNER_ESCALATION_NUMBER || '').trim();
      if (!destination) {
        return {
          ok: false,
          error: 'VOICE_OWNER_ESCALATION_NUMBER is not configured.',
        };
      }
      const reason = asString(args.reason) || 'Caller requested owner';
      await transferCall(context.callControlId, destination);
      return {
        ok: true,
        transferred_to: destination,
        reason,
      };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
