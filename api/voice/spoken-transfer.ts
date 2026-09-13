/**
 * Detect a spoken transfer commitment so the server can fire route_department
 * when the model talks about handing off but never calls the tool.
 */

import {
  type VoiceDepartment,
  destinationDepartment,
} from '../../shared/voice-team.js';

const PERMISSION_RE =
  /\b(would you like|do you want|should i|can i|is that ok|is that okay|if you('d| would) like|if you want|want me to)\b/i;

const COMMIT_RE =
  /\b(connecting you|transfer(?:ring)? you|put(?:ting)? you through|send(?:ing)? you (?:over|to|through)|i('ll| will) (?:get|send|transfer|connect)|let me (?:get|send|transfer|connect)|one moment while i|hold on while i|going to transfer|about to transfer|i('m| am) transfer)\b/i;

const DEPARTMENT_HINTS: Array<{ re: RegExp; department: VoiceDepartment }> = [
  {
    re: /\b(partner|julian|white[-\s]?label|reseller|agency program|partner program)\b/i,
    department: 'partner',
  },
  {
    re: /\b(recruit|jordan|career|sales agent|human resources|\bhr\b)\b/i,
    department: 'recruiting',
  },
  {
    re: /\b(billing|helen|invoice|refund|charge|payment)\b/i,
    department: 'billing',
  },
  {
    re: /\b(support|sophie|customer care|troubleshoot|broken|not working)\b/i,
    department: 'support',
  },
  {
    re: /\b(manager|daniel|escalat|supervisor|owner)\b/i,
    department: 'manager',
  },
  {
    re: /\b(sales|marcus|maya|pricing|demo|quote)\b/i,
    department: 'sales',
  },
];

export function inferRequestedDepartment(text: string): VoiceDepartment | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const asDept = destinationDepartment(trimmed.toLowerCase().replace(/\s+/g, '_'));
  if (asDept) return asDept;
  for (const hint of DEPARTMENT_HINTS) {
    if (hint.re.test(trimmed)) return hint.department;
  }
  return null;
}

export function looksLikeTransferCommit(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (PERMISSION_RE.test(trimmed)) return false;
  return COMMIT_RE.test(trimmed);
}

export function inferSpokenTransfer(text: string): VoiceDepartment | null {
  if (!looksLikeTransferCommit(text)) return null;
  return inferRequestedDepartment(text);
}

export function inferDepartmentFromContext(reason: string): VoiceDepartment | null {
  return inferRequestedDepartment(reason);
}
