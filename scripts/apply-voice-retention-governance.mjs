import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, search, replacement) {
  const source = readFileSync(path, 'utf8');
  if (source.includes(replacement)) return false;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Patch anchor not found in ${path}: ${search.slice(0, 120)}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Patch anchor is ambiguous in ${path}: ${search.slice(0, 120)}`);
  }
  writeFileSync(path, source.slice(0, first) + replacement + source.slice(first + search.length));
  return true;
}

const path = 'api/voice/telnyx-live.ts';

replaceOnce(
  path,
  `} from '../../shared/voice-team.js';\nimport { departmentInstructions } from '../phone/corporate-routing.js';`,
  `} from '../../shared/voice-team.js';\nimport {\n  RETENTION_OBJECTIONS,\n  type RetentionObjection,\n  type RetentionState,\n  authorizeNextRetentionOffer,\n  createRetentionState,\n  markLatestRetentionOfferOutcome,\n  retentionAuditSnapshot,\n} from '../../shared/voice-commercial-policy.js';\nimport { departmentInstructions } from '../phone/corporate-routing.js';`,
);

replaceOnce(
  path,
  `  sharedContext?: SharedCallContext;\n  outboundObjective?: string;`,
  `  sharedContext?: SharedCallContext;\n  retentionState: RetentionState;\n  outboundObjective?: string;`,
);

replaceOnce(
  path,
  `    organizationId,\n    phoneConfig,\n    ...(objective`,
  `    organizationId,\n    phoneConfig,\n    retentionState: createRetentionState(),\n    ...(objective`,
);

replaceOnce(
  path,
  `function buildSystemInstruction(context: SessionContext): string {`,
  `function departmentOperatingRules(context: SessionContext): string {\n  switch (context.department || 'receptionist') {\n    case 'receptionist':\n      return 'Identify the caller, whether they are an existing customer, the reason for the call, desired outcome and urgency. Route without friction. Do not troubleshoot complex issues or negotiate price.';\n    case 'sales':\n      return 'Discover the real objective, current process, buying criteria, timing and blocker. Establish relevant supported value before discussing price. You do not have exceptional discount authority. If price is genuinely the final unresolved blocker after value has been established, route to manager with the facts already learned.';\n    case 'support':\n      return 'Resolve the operational, account, configuration or product issue first. Identify churn or cancellation risk without immediately offering a commercial concession. Escalate unresolved service issues or retention risk to manager with what has already been tried.';\n    case 'manager':\n      return 'Operate in this order: UNDERSTAND, ISOLATE, RESOLVE, VALUE, CONFIRM, INCENTIVIZE, CLOSE, ESCALATE. Never begin by discounting. Use request_retention_offer only after the real blocker is isolated and value has been defended. Do not state or infer internal discount limits, remaining authority, ladders or floors. Before a stronger concession, establish whether resolving price allows the customer to proceed. Use escalate_to_owner only when owner-level judgment is genuinely required or the caller insists after reasonable resolution efforts.';\n  }\n}\n\nfunction buildSystemInstruction(context: SessionContext): string {`,
);

replaceOnce(
  path,
  `    \`Preferred opening greeting: \${agent.firstMessage}\`,\n    context.botId === CORPORATE.botId`,
  `    \`Preferred opening greeting: \${agent.firstMessage}\`,\n    departmentOperatingRules(context),\n    context.botId === CORPORATE.botId`,
);

replaceOnce(
  path,
  `  return [{ functionDeclarations }];\n}\n\nasync function patchCallLog`,
  `  if (\n    context.botId === CORPORATE.botId &&\n    (context.department || 'receptionist') === 'manager'\n  ) {\n    functionDeclarations.push(\n      {\n        name: 'request_retention_offer',\n        description:\n          'Request the next server-authorized temporary introductory offer after the real objection has been isolated and value has been established. The server, not the model, decides the amount and authority.',\n        parameters: {\n          type: 'OBJECT',\n          properties: {\n            planId: { type: 'STRING' },\n            objection: { type: 'STRING', enum: [...RETENTION_OBJECTIONS] },\n            months: { type: 'NUMBER' },\n            reason: { type: 'STRING' },\n            valueDefended: { type: 'BOOLEAN' },\n            conditionalCommitment: { type: 'BOOLEAN' },\n            competitorName: { type: 'STRING' },\n            desiredOutcome: { type: 'STRING' },\n          },\n          required: [\n            'planId',\n            'objection',\n            'months',\n            'reason',\n            'valueDefended',\n            'conditionalCommitment',\n          ],\n        },\n      },\n      {\n        name: 'record_retention_offer_outcome',\n        description:\n          'Record whether the latest server-authorized introductory offer was accepted after the caller responds.',\n        parameters: {\n          type: 'OBJECT',\n          properties: {\n            accepted: { type: 'BOOLEAN' },\n            note: { type: 'STRING' },\n          },\n          required: ['accepted'],\n        },\n      },\n    );\n    if (configuredOwnerEscalation()) {\n      functionDeclarations.push({\n        name: 'escalate_to_owner',\n        description:\n          'Warm-transfer an unresolved manager-level situation to the privately configured owner destination. The destination itself is confidential and is never returned to you.',\n        parameters: {\n          type: 'OBJECT',\n          properties: {\n            reason: { type: 'STRING' },\n            callerName: { type: 'STRING' },\n            company: { type: 'STRING' },\n            objection: { type: 'STRING' },\n            stepsAlreadyTaken: { type: 'STRING' },\n            pricingDiscussed: { type: 'STRING' },\n            competitorName: { type: 'STRING' },\n            desiredOutcome: { type: 'STRING' },\n            emotionalState: { type: 'STRING' },\n          },\n          required: ['reason', 'stepsAlreadyTaken'],\n        },\n      });\n    }\n  }\n  return [{ functionDeclarations }];\n}\n\nasync function patchCallLog`,
);

replaceOnce(
  path,
  `    return {\n      success: true,\n      transferredTo: transferNumber,\n      hotLeadAlertSent: alert.success,\n    };`,
  `    return {\n      success: true,\n      transferred: true,\n      hotLeadAlertSent: alert.success,\n    };`,
);

replaceOnce(
  path,
  `async function requestAppointment(\n  context: SessionContext,`,
  `function configuredOwnerEscalation(): string {\n  return (process.env.VOICE_OWNER_ESCALATION_NUMBER || '').trim();\n}\n\nasync function persistRetentionAudit(context: SessionContext): Promise<void> {\n  if (!context.logId) return;\n  await mergeCallMetadata(context.logId, {\n    retentionAudit: retentionAuditSnapshot(context.retentionState),\n    retentionAuditUpdatedAt: new Date().toISOString(),\n  });\n}\n\nasync function requestRetentionOffer(\n  context: SessionContext,\n  args: JsonObject,\n): Promise<ToolResult> {\n  if (context.botId !== CORPORATE.botId || context.department !== 'manager') {\n    return { success: false, reason: 'This call does not have manager incentive authority.' };\n  }\n  const objection = String(args.objection || 'other') as RetentionObjection;\n  if (!RETENTION_OBJECTIONS.includes(objection)) {\n    return { success: false, reason: 'Unknown objection type.' };\n  }\n  try {\n    const offer = authorizeNextRetentionOffer({\n      department: context.department,\n      state: context.retentionState,\n      planId: String(args.planId || ''),\n      objection,\n      months: Number(args.months),\n      reason: String(args.reason || ''),\n      valueDefended: args.valueDefended === true,\n      conditionalCommitment: args.conditionalCommitment === true,\n      competitorName: String(args.competitorName || ''),\n      desiredOutcome: String(args.desiredOutcome || ''),\n    });\n    await persistRetentionAudit(context);\n    return { success: true, offer };\n  } catch (error: unknown) {\n    return {\n      success: false,\n      reason: error instanceof Error ? error.message : 'Retention offer was not authorized.',\n    };\n  }\n}\n\nasync function recordRetentionOfferOutcome(\n  context: SessionContext,\n  args: JsonObject,\n): Promise<ToolResult> {\n  if (context.botId !== CORPORATE.botId || context.department !== 'manager') {\n    return { success: false, reason: 'This call does not have manager incentive authority.' };\n  }\n  try {\n    const entry = markLatestRetentionOfferOutcome(\n      context.retentionState,\n      args.accepted === true,\n      String(args.note || ''),\n    );\n    await persistRetentionAudit(context);\n    return { success: true, accepted: entry.accepted };\n  } catch (error: unknown) {\n    return {\n      success: false,\n      reason: error instanceof Error ? error.message : 'Offer outcome could not be recorded.',\n    };\n  }\n}\n\nasync function escalateToOwner(\n  context: SessionContext,\n  args: JsonObject,\n): Promise<ToolResult> {\n  if (context.botId !== CORPORATE.botId || context.department !== 'manager') {\n    return { success: false, reason: 'Owner escalation is available only from the corporate manager.' };\n  }\n  const destination = configuredOwnerEscalation();\n  if (!destination) return { success: false, reason: 'Owner escalation is not configured.' };\n  if (!context.callControlId) return { success: false, reason: 'Live call control is unavailable.' };\n\n  const clean = (key: string, max = 1000) => String(args[key] || '').trim().slice(0, max);\n  const handoff = {\n    callerName: clean('callerName', 200),\n    company: clean('company', 200),\n    reason: clean('reason'),\n    objection: clean('objection', 200),\n    stepsAlreadyTaken: clean('stepsAlreadyTaken', 2000),\n    pricingDiscussed: clean('pricingDiscussed', 1000),\n    competitorName: clean('competitorName', 200),\n    desiredOutcome: clean('desiredOutcome', 1000),\n    emotionalState: clean('emotionalState', 200),\n    requestedAt: new Date().toISOString(),\n  };\n  if (!handoff.reason || !handoff.stepsAlreadyTaken) {\n    return { success: false, reason: 'A reason and the resolution steps already attempted are required.' };\n  }\n\n  try {\n    if (context.logId) {\n      await mergeCallMetadata(context.logId, {\n        ownerEscalationRequested: true,\n        ownerEscalationHandoff: handoff,\n        retentionAudit: retentionAuditSnapshot(context.retentionState),\n      });\n    }\n    await transferCall(context.callControlId, destination, {\n      from: context.calledNumber || undefined,\n    });\n    return { success: true, transferred: true };\n  } catch (error: unknown) {\n    const reason = error instanceof Error ? error.message : 'Owner transfer failed';\n    if (context.logId) {\n      await mergeCallMetadata(context.logId, { ownerEscalationFailed: reason });\n    }\n    return { success: false, reason };\n  }\n}\n\nasync function requestAppointment(\n  context: SessionContext,`,
);

replaceOnce(
  path,
  `    case 'transfer_to_human':\n      return transferToHuman(context, args);\n    case 'request_appointment':`,
  `    case 'transfer_to_human':\n      return transferToHuman(context, args);\n    case 'request_retention_offer':\n      return requestRetentionOffer(context, args);\n    case 'record_retention_offer_outcome':\n      return recordRetentionOfferOutcome(context, args);\n    case 'escalate_to_owner':\n      return escalateToOwner(context, args);\n    case 'request_appointment':`,
);

replaceOnce(
  path,
  `export function setupGeminiSession(gemini: WebSocket, context: SessionContext) {`,
  `function thinkingLevelForDepartment(\n  department: VoiceDepartment | undefined,\n): 'minimal' | 'low' | 'medium' {\n  if (department === 'manager') return 'medium';\n  if (department === 'sales' || department === 'support') return 'low';\n  return 'minimal';\n}\n\nexport function setupGeminiSession(gemini: WebSocket, context: SessionContext) {`,
);

replaceOnce(
  path,
  `        thinkingConfig: { thinkingLevel: 'minimal' },`,
  `        thinkingConfig: { thinkingLevel: thinkingLevelForDepartment(context.department) },`,
);

replaceOnce(
  path,
  `          reason: { type: 'STRING' },\n        },\n        required: ['department', 'summary'],`,
  `          reason: { type: 'STRING' },\n          desiredOutcome: { type: 'STRING' },\n          objection: { type: 'STRING' },\n          emotionalState: { type: 'STRING' },\n          competitorName: { type: 'STRING' },\n          attemptedResolutions: { type: 'ARRAY', items: { type: 'STRING' } },\n          pricingDiscussed: { type: 'ARRAY', items: { type: 'STRING' } },\n        },\n        required: ['department', 'summary'],`,
);

replaceOnce(
  path,
  `          const details = (key: string) =>\n            typeof call.args?.[key] === 'string'\n              ? String(call.args[key]).slice(0, 200)\n              : undefined;\n          const sharedContext: SharedCallContext = {\n            ...next.sharedContext,\n            callerNumber: next.callerNumber,\n            callerName: details('callerName') || next.sharedContext?.callerName,\n            company: details('company') || next.sharedContext?.company,\n            reason: details('reason') || next.sharedContext?.reason,\n            summary,\n            transcript,\n          };`,
  `          const details = (key: string) =>\n            typeof call.args?.[key] === 'string'\n              ? String(call.args[key]).slice(0, 500)\n              : undefined;\n          const listDetails = (key: string) =>\n            Array.isArray(call.args?.[key])\n              ? (call.args?.[key] as unknown[])\n                  .filter((value): value is string => typeof value === 'string')\n                  .slice(0, 12)\n                  .map((value) => value.slice(0, 500))\n              : undefined;\n          const sharedContext: SharedCallContext = {\n            ...next.sharedContext,\n            callerNumber: next.callerNumber,\n            callerName: details('callerName') || next.sharedContext?.callerName,\n            company: details('company') || next.sharedContext?.company,\n            reason: details('reason') || next.sharedContext?.reason,\n            desiredOutcome:\n              details('desiredOutcome') || next.sharedContext?.desiredOutcome,\n            objection: details('objection') || next.sharedContext?.objection,\n            emotionalState:\n              details('emotionalState') || next.sharedContext?.emotionalState,\n            competitorName:\n              details('competitorName') || next.sharedContext?.competitorName,\n            attemptedResolutions:\n              listDetails('attemptedResolutions') ||\n              next.sharedContext?.attemptedResolutions,\n            pricingDiscussed:\n              listDetails('pricingDiscussed') || next.sharedContext?.pricingDiscussed,\n            summary,\n            transcript,\n          };`,
);

const envPath = '.env.example';
let env = readFileSync(envPath, 'utf8');
if (!env.includes('VOICE_OWNER_ESCALATION_NUMBER=')) {
  env += `\n# Private server-side destination for corporate manager -> owner warm transfers.\n# Never put this value in a prompt, client bundle, or model-visible tool result.\nVOICE_OWNER_ESCALATION_NUMBER=\n`;
  writeFileSync(envPath, env);
}

console.log('Applied voice retention governance patch.');
