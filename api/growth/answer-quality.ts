/**
 * P2 — missing-answer inbox + answer feedback loop.
 *
 * The single highest-leverage retention mechanic for this product: every
 * question the bot fumbled is a question the owner can fix, and each fix
 * makes the bot measurably better. Two halves:
 *
 *  1. DETECTION (`classifyAnswer`) — pure, so it's testable and behaves the
 *     same in chat, voice and tests. It looks at whether RAG retrieved
 *     anything and whether the model actually answered or deflected. No LLM
 *     call: this runs on every message, so it must be free and instant.
 *
 *  2. FEEDBACK — 👍 / 👎 from the end visitor, and "Correct Answer" from the
 *     owner. A correction is not just a label: it is appended to the bot's
 *     knowledge base, so answering the inbox literally trains the bot.
 *
 * Every write is best-effort and never blocks the reply to the visitor.
 */
import crypto from 'node:crypto';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export type AnswerStatus = 'answered' | 'unanswered';
export type AnswerReason =
  | 'no_knowledge'
  | 'deflected'
  | 'thin_answer'
  | 'negative_feedback'
  | null;
export type Feedback = 'up' | 'down';

export interface AnswerClassification {
  status: AnswerStatus;
  reason: AnswerReason;
  /** 0-1. Deliberately coarse — it ranks the inbox, it doesn't gate replies. */
  confidence: number;
}

/**
 * Phrases that mean "I could not answer that". Kept explicit rather than
 * regex-golfed, because this list is the thing a human will want to tune
 * after reading a week of real transcripts.
 */
const DEFLECTION_PATTERNS: RegExp[] = [
  /\bi (?:don'?t|do not) have (?:that|any|enough|the) (?:information|info|details|data)\b/i,
  /\bi(?:'?m| am) not sure\b/i,
  /\bi (?:don'?t|do not) know\b/i,
  /\bi (?:can'?t|cannot) (?:help|answer|assist|find)\b/i,
  /\bthat'?s (?:not|outside) (?:something|my)\b/i,
  /\bno information (?:about|on|regarding)\b/i,
  /\bplease (?:contact|reach out to|call|email) (?:us|our|the)\b/i,
  /\bi(?:'?m| am) unable to\b/i,
  /\bas an ai\b/i,
];

/** Short generic replies that are technically answers but carry no content. */
const THIN_ANSWER_MAX_CHARS = 40;

export interface ClassifyInput {
  question: string;
  answer: string;
  /** How many knowledge chunks RAG actually retrieved for this question. */
  retrievedChunks?: number;
  /** True when the bot has any knowledge configured at all. */
  hasKnowledge?: boolean;
}

export function classifyAnswer(input: ClassifyInput): AnswerClassification {
  const answer = (input.answer || '').trim();
  const question = (input.question || '').trim();

  // No question means nothing to grade (widget pings, empty turns).
  if (!question) return { status: 'answered', reason: null, confidence: 1 };

  const deflected = DEFLECTION_PATTERNS.some((re) => re.test(answer));
  if (deflected) {
    return { status: 'unanswered', reason: 'deflected', confidence: 0.1 };
  }

  // A knowledge-backed bot that retrieved nothing answered from the model's
  // general priors, not from the business — exactly the answers an owner
  // most wants to review, even when they read fluently.
  const retrieved = input.retrievedChunks ?? 0;
  if (input.hasKnowledge && retrieved === 0) {
    return { status: 'unanswered', reason: 'no_knowledge', confidence: 0.35 };
  }

  if (answer.length < THIN_ANSWER_MAX_CHARS) {
    return { status: 'unanswered', reason: 'thin_answer', confidence: 0.4 };
  }

  // More retrieved context => more confidence, saturating quickly.
  const confidence = Math.min(1, 0.6 + retrieved * 0.08);
  return { status: 'answered', reason: null, confidence };
}

export interface AnswerEventInput {
  botId: string;
  userId?: string | null;
  organizationId?: string | null;
  sessionId?: string | null;
  question: string;
  answer: string;
  classification: AnswerClassification;
  channel?: 'chat' | 'voice';
}

/**
 * Persist one graded Q/A turn. Returns the row id so the widget can attach
 * 👍/👎 to this exact answer; null on any failure (never throws — a broken
 * inbox must not break the chat).
 */
export async function recordAnswerEvent(
  input: AnswerEventInput,
): Promise<string | null> {
  if (!input.botId || !SUPABASE_URL || !SERVICE_KEY) return null;
  const id = crypto.randomUUID();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/answer_events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        id,
        bot_id: input.botId,
        user_id: input.userId ?? null,
        organization_id: input.organizationId ?? null,
        session_id: input.sessionId ?? null,
        channel: input.channel || 'chat',
        question: input.question.slice(0, 2000),
        answer: input.answer.slice(0, 8000),
        status: input.classification.status,
        reason: input.classification.reason,
        confidence: input.classification.confidence,
        resolved: false,
      }),
    });
    if (!res.ok) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * End-visitor feedback. A 👎 promotes the turn into the owner's inbox even
 * when our heuristics thought the answer was fine — the visitor is the
 * better judge, and this is where most real corrections will come from.
 */
export async function recordFeedback(
  answerId: string,
  feedback: Feedback,
): Promise<boolean> {
  if (!answerId || (feedback !== 'up' && feedback !== 'down')) return false;
  const patch: Record<string, unknown> = { feedback };
  if (feedback === 'down') {
    patch.status = 'unanswered';
    patch.reason = 'negative_feedback';
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/answer_events?id=eq.${encodeURIComponent(answerId)}`,
      { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Merge an owner correction into a bot's inline knowledge base.
 *
 * Pure on purpose: the caller owns the read and the write, so this can be
 * unit-tested and reused by the voice path without duplicating merge rules.
 * Corrections are stored as Q→A pairs, which is the shape retrieval handles
 * best, and re-correcting the same question replaces the old entry instead
 * of stacking contradictory answers.
 */
export function mergeCorrection(
  existing: unknown,
  question: string,
  answer: string,
): { content: string; source: string }[] {
  const entries = Array.isArray(existing)
    ? existing.map((k: any) =>
        typeof k === 'string'
          ? { content: k, source: 'knowledge_base' }
          : { content: k?.content || '', source: k?.source || 'knowledge_base' },
      )
    : [];
  const q = question.trim();
  const content = `Q: ${q}\nA: ${answer.trim()}`;
  const kept = entries.filter(
    (e) =>
      e.content &&
      !(e.source === 'owner_correction' && e.content.startsWith(`Q: ${q}\n`)),
  );
  kept.push({ content, source: 'owner_correction' });
  return kept;
}

/** Inbox counters for the dashboard card. */
export function summarizeInbox(rows: { status: string; resolved?: boolean }[]) {
  const open = rows.filter((r) => r.status === 'unanswered' && !r.resolved);
  return {
    open: open.length,
    resolved: rows.filter((r) => r.resolved).length,
    total: rows.length,
  };
}
