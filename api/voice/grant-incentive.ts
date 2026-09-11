import { randomUUID } from 'node:crypto';
import { rememberMemory } from '../ai-team/lib.js';
import { sendSms } from '../lib/telephony-provider.js';
import {
  type GrantIncentiveResult,
  type WorkspaceIncentiveConfig,
  IncentivePolicyViolation,
  authorizeGrantIncentive,
  defaultWorkspaceIncentiveConfig,
  parseWorkspaceIncentiveConfig,
} from '../../shared/incentive-playbook.js';
import type { VoiceDepartment } from '../../shared/voice-team.js';

type JsonObject = Record<string, unknown>;
type ToolResult = JsonObject & { success: boolean };

export interface GrantIncentiveSessionContext {
  botId: string;
  logId: string;
  callControlId: string;
  callerNumber: string;
  calledNumber: string;
  userId: string | null;
  organizationId: string | null;
  department?: VoiceDepartment;
  team?: {
    manager?: { name?: string };
  };
}

export const GRANT_INCENTIVE_TOOL = {
  name: 'grant_incentive',
  description:
    'Grant a pre-approved Support Manager incentive offer code after an objection tag is set AND a value-pitch attempt has been made. The server enforces workspace caps and returns the offer code. Never invent discounts outside the playbook.',
  parameters: {
    type: 'OBJECT',
    properties: {
      offerCode: {
        type: 'STRING',
        description:
          'Workspace playbook offer code (e.g. VALUE_10, FREE_MONTH_1)',
      },
      objectionTag: {
        type: 'STRING',
        enum: [
          'price',
          'competitor',
          'trust',
          'timing',
          'implementation',
          'missing_capability',
          'service_issue',
          'cancellation_risk',
          'other',
        ],
      },
      valuePitchAttempted: {
        type: 'BOOLEAN',
        description:
          'Must be true only after you defended value / pitched ROI before offering an incentive',
      },
      reason: {
        type: 'STRING',
        description: 'Why this incentive is appropriate for this caller',
      },
      percentOff: {
        type: 'NUMBER',
        description: 'Optional percent off within the offer/workspace cap',
      },
      freeMonths: {
        type: 'NUMBER',
        description: 'Optional free months within the offer/workspace ceiling',
      },
      leadId: {
        type: 'STRING',
        description: 'CRM lead id when already known',
      },
    },
    required: ['offerCode', 'objectionTag', 'valuePitchAttempted', 'reason'],
  },
} as const;

async function sbRequest(
  table: string,
  params = '',
  init?: RequestInit,
): Promise<{ ok: boolean; data: unknown }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { ok: false, data: null };
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
      ...init,
      signal: AbortSignal.timeout(5000),
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

function asRows(data: unknown): JsonObject[] {
  return Array.isArray(data) ? (data as JsonObject[]) : [];
}

export async function loadWorkspaceIncentiveConfig(
  organizationId: string | null,
): Promise<WorkspaceIncentiveConfig> {
  if (!organizationId) return defaultWorkspaceIncentiveConfig();
  const result = await sbRequest(
    'organizations',
    `id=eq.${encodeURIComponent(organizationId)}&select=settings&limit=1`,
  );
  const row = asRows(result.data)[0];
  const settings =
    row?.settings && typeof row.settings === 'object'
      ? (row.settings as JsonObject)
      : {};
  try {
    return parseWorkspaceIncentiveConfig(settings.incentivePlaybook);
  } catch {
    // Fail closed to defaults rather than inventing open-ended discounts.
    return defaultWorkspaceIncentiveConfig();
  }
}

async function resolveLeadId(
  context: GrantIncentiveSessionContext,
  explicitLeadId?: string,
): Promise<string | null> {
  if (explicitLeadId?.trim()) return explicitLeadId.trim();
  if (!context.logId) return null;
  const logResult = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(context.logId)}&select=lead_id,metadata&limit=1`,
  );
  const log = asRows(logResult.data)[0];
  if (typeof log?.lead_id === 'string' && log.lead_id) return log.lead_id;

  if (context.callerNumber) {
    const leadResult = await sbRequest(
      'leads',
      `phone=eq.${encodeURIComponent(context.callerNumber)}${
        context.organizationId
          ? `&organization_id=eq.${encodeURIComponent(context.organizationId)}`
          : ''
      }&select=id&order=created_at.desc&limit=1`,
    );
    const lead = asRows(leadResult.data)[0];
    if (typeof lead?.id === 'string') return lead.id;
  }
  return null;
}

async function mergeCallMetadata(
  logId: string,
  extra: JsonObject,
): Promise<boolean> {
  if (!logId) return false;
  const current = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(logId)}&select=metadata&limit=1`,
  );
  const row = asRows(current.data)[0];
  const metadata =
    row?.metadata && typeof row.metadata === 'object'
      ? (row.metadata as JsonObject)
      : {};
  const result = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(logId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ metadata: { ...metadata, ...extra } }),
    },
  );
  return result.ok;
}

async function alreadySentIncentiveSms(
  logId: string,
  offerCode: string,
): Promise<boolean> {
  if (!logId) return false;
  const current = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(logId)}&select=metadata&limit=1`,
  );
  const row = asRows(current.data)[0];
  const metadata =
    row?.metadata && typeof row.metadata === 'object'
      ? (row.metadata as JsonObject)
      : {};
  const grants = Array.isArray(metadata.incentiveGrants)
    ? (metadata.incentiveGrants as JsonObject[])
    : [];
  return grants.some(
    (grant) =>
      grant.offerCode === offerCode && grant.smsSent === true,
  );
}

async function writeLeadTimeline(params: {
  context: GrantIncentiveSessionContext;
  leadId: string;
  grant: GrantIncentiveResult;
  reason: string;
  grantedAt: string;
  grantedBy: string;
}): Promise<boolean> {
  const summary = `Incentive grant ${params.grant.offerCode}: ${params.grant.terms}. Why: ${params.reason.trim().slice(0, 500)}. Who: ${params.grantedBy}. When: ${params.grantedAt}.`;

  await rememberMemory({
    roleId: 'voice-support-manager',
    subjectType: 'lead',
    subjectId: params.leadId,
    content: summary,
    organizationId: params.context.organizationId || 'house',
    metadata: {
      type: 'incentive_grant',
      offerCode: params.grant.offerCode,
      percentOff: params.grant.percentOff,
      freeMonths: params.grant.freeMonths,
      objectionTag: params.grant.objectionTag,
      reason: params.reason.trim().slice(0, 1000),
      grantedBy: params.grantedBy,
      grantedAt: params.grantedAt,
      callLogId: params.context.logId,
      callControlId: params.context.callControlId,
      botId: params.context.botId,
    },
  });

  const note = `[${params.grantedAt}] ${params.grantedBy} granted ${params.grant.offerCode} (${params.grant.terms}) — ${params.reason.trim().slice(0, 400)}`;
  const patched = await sbRequest(
    'leads',
    `id=eq.${encodeURIComponent(params.leadId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_ai_action_at: params.grantedAt,
        ai_notes: note.slice(0, 1000),
        last_contacted_at: params.grantedAt,
        contact_method: 'call',
      }),
    },
  );
  return patched.ok;
}

/**
 * Gated Support Manager incentive grant:
 * A) refuses unless objection tag + value-pitch attempt
 * B) writes who/when/why/offer code to lead timeline under workspace caps
 * C) sends the same terms once via Telnyx SMS
 */
export async function executeGrantIncentive(
  context: GrantIncentiveSessionContext,
  args: JsonObject,
): Promise<ToolResult> {
  if ((context.department || 'receptionist') !== 'manager') {
    return {
      success: false,
      reason: 'grant_incentive is only available to the Support Manager agent.',
    };
  }

  const grantedAt = new Date().toISOString();
  const grantedBy =
    context.team?.manager?.name?.trim() ||
    'Support Manager (voice AI)';

  try {
    const config = await loadWorkspaceIncentiveConfig(context.organizationId);
    const grant = authorizeGrantIncentive({
      department: 'manager',
      objectionTag: String(args.objectionTag || ''),
      valuePitchAttempted: args.valuePitchAttempted === true,
      offerCode: String(args.offerCode || ''),
      percentOff:
        args.percentOff === undefined ? undefined : Number(args.percentOff),
      freeMonths:
        args.freeMonths === undefined ? undefined : Number(args.freeMonths),
      reason: String(args.reason || ''),
      config,
    });

    const leadId = await resolveLeadId(
      context,
      typeof args.leadId === 'string' ? args.leadId : undefined,
    );

    let timelineWritten = false;
    if (leadId) {
      timelineWritten = await writeLeadTimeline({
        context,
        leadId,
        grant,
        reason: String(args.reason || ''),
        grantedAt,
        grantedBy,
      });
      if (context.logId) {
        await sbRequest(`call_logs`, `id=eq.${encodeURIComponent(context.logId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ lead_id: leadId }),
        });
      }
    }

    const smsAlreadySent = await alreadySentIncentiveSms(
      context.logId,
      grant.offerCode,
    );
    let smsSent = false;
    let smsId: string | undefined;
    let smsReason: string | undefined;

    if (smsAlreadySent) {
      smsReason = 'Incentive SMS already sent for this offer on this call.';
    } else if (!context.callerNumber) {
      smsReason = 'Caller number unavailable for SMS.';
    } else {
      try {
        const sent = await sendSms({
          to: context.callerNumber,
          from: context.calledNumber || undefined,
          text: grant.smsBody.slice(0, 1600),
        });
        smsSent = true;
        smsId = sent.id;
      } catch (error: unknown) {
        smsReason =
          error instanceof Error ? error.message : 'Telnyx SMS send failed';
      }
    }

    const grantRecord = {
      id: randomUUID(),
      offerCode: grant.offerCode,
      percentOff: grant.percentOff,
      freeMonths: grant.freeMonths,
      objectionTag: grant.objectionTag,
      reason: String(args.reason || '').trim().slice(0, 1000),
      terms: grant.terms,
      grantedBy,
      grantedAt,
      leadId,
      timelineWritten,
      smsSent,
      smsId: smsId || null,
      smsReason: smsReason || null,
      callControlId: context.callControlId,
    };

    if (context.logId) {
      const current = await sbRequest(
        'call_logs',
        `id=eq.${encodeURIComponent(context.logId)}&select=metadata&limit=1`,
      );
      const row = asRows(current.data)[0];
      const metadata =
        row?.metadata && typeof row.metadata === 'object'
          ? (row.metadata as JsonObject)
          : {};
      const prior = Array.isArray(metadata.incentiveGrants)
        ? (metadata.incentiveGrants as JsonObject[])
        : [];
      await mergeCallMetadata(context.logId, {
        incentiveGrants: [...prior, grantRecord],
        lastIncentiveGrantAt: grantedAt,
      });
    }

    // Fail closed on CRM write when a lead exists but timeline write failed.
    if (leadId && !timelineWritten) {
      return {
        success: false,
        reason:
          'Incentive authorized but lead timeline write failed. No customer-facing confirmation should be made until CRM write succeeds.',
        offerCode: grant.offerCode,
        smsSent,
      };
    }

    if (!leadId) {
      return {
        success: true,
        offerCode: grant.offerCode,
        terms: grant.terms,
        smsSent,
        smsId: smsId || null,
        warning:
          'No CRM lead was linked to this call yet. Capture a lead so the grant appears on the lead timeline.',
        callAuditRecorded: Boolean(context.logId),
      };
    }

    return {
      success: true,
      offerCode: grant.offerCode,
      terms: grant.terms,
      percentOff: grant.percentOff,
      freeMonths: grant.freeMonths,
      objectionTag: grant.objectionTag,
      leadId,
      timelineWritten: true,
      smsSent,
      smsId: smsId || null,
      smsSkippedReason: smsSent ? null : smsReason || null,
      grantedBy,
      grantedAt,
    };
  } catch (error: unknown) {
    if (error instanceof IncentivePolicyViolation) {
      return { success: false, reason: error.message };
    }
    return {
      success: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Incentive grant was refused.',
    };
  }
}
