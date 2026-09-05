import { z } from 'zod';

export const SMS_PLANS = {
  SMS_STARTER: { price: 39, segments: 1000, overageMicros: 20000 },
  SMS_GROWTH: { price: 99, segments: 5000, overageMicros: 18000 },
  SMS_SCALE: { price: 249, segments: 20000, overageMicros: 15000 },
} as const;
export type SmsPlan = keyof typeof SMS_PLANS;
export const PURPOSES = ['marketing', 'birthday', 'appointment', 'contest', 'conversation', 'lead_alert'] as const;
export type SmsPurpose = (typeof PURPOSES)[number];
export const SYSTEM_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'HELP', 'INFO', 'START', 'YES', 'SUBSCRIBE', 'CONFIRM', 'RESCHEDULE']);

export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s().+-]/g, '');
  const phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone)) throw new Error('Enter a valid US phone number');
  return phone;
}

const GSM = new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà');
const GSM_EXT = new Set('^{}\\[~]|€\f');
export function smsSegments(text: string): number {
  if (!text) return 0;
  let length = 0;
  for (const ch of text) {
    if (GSM.has(ch)) length++;
    else if (GSM_EXT.has(ch)) length += 2;
    else return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  }
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}
export const timezoneSchema = z.string().min(1).refine(validTimezone, 'Use a valid timezone, such as America/Chicago');
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, Number(p.value)])) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>;
}
export function localInstant(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone);
    guess += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}
export function nextSendTime(date: Date, timezone: string, start = 9, end = 20): Date {
  const p = localParts(date, timezone);
  if (p.hour >= start && p.hour < end) return date;
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + (p.hour >= end ? 1 : 0)));
  return localInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), start, 0, timezone);
}
export function validBirthday(month: number, day: number): boolean {
  const date = new Date(Date.UTC(2000, month - 1, day));
  return month >= 1 && month <= 12 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function birthdayDate(year: number, month: number, day: number, timezone: string): Date {
  if (!validBirthday(month, day)) throw new Error('Invalid birthday');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return localInstant(year, month, month === 2 && day === 29 && !leap ? 28 : day, 10, 0, timezone);
}
export function renderSms(template: string, fields: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => fields[key] || '').trim();
}

const textSchema = z.string().trim().min(1).max(1600);
export const contactSchema = z.object({
  phone: z.string().transform(normalizePhone), name: z.string().trim().max(160).default(''),
  timezone: timezoneSchema.optional(), tags: z.array(z.string().max(60)).max(30).default([]),
  birthMonth: z.number().int().min(1).max(12).optional(), birthDay: z.number().int().min(1).max(31).optional(),
  consents: z.array(z.enum(PURPOSES)).default([]), consentSource: z.string().trim().min(1).max(500),
}).refine(c => (!c.birthMonth && !c.birthDay) || (!!c.birthMonth && !!c.birthDay && validBirthday(c.birthMonth, c.birthDay)), 'Invalid birthday');

export const programSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['campaign', 'keyword', 'welcome', 'after_hours', 'sequence', 'contest', 'birthday']),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  keyword: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,24}$/).optional(),
  text: textSchema, tag: z.string().max(60).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  steps: z.array(z.object({ delayMinutes: z.number().int().min(1).max(525600), text: textSchema })).max(20).default([]),
  opensAt: z.iso.datetime({ offset: true }).optional(), closesAt: z.iso.datetime({ offset: true }).optional(),
  prize: z.string().trim().max(500).optional(), rulesUrl: z.url().optional(), entryUrl: z.url().optional(),
  eligibility: z.string().trim().max(2000).optional(), winnerCount: z.number().int().min(1).max(100).default(1),
  winnerText: textSchema.optional(), confirmationText: textSchema.optional(),
}).superRefine((p, ctx) => {
  if (p.keyword && SYSTEM_KEYWORDS.has(p.keyword)) ctx.addIssue({ code: 'custom', message: 'This keyword is reserved', path: ['keyword'] });
  if (['keyword', 'sequence', 'contest', 'birthday'].includes(p.kind) && !p.keyword) ctx.addIssue({ code: 'custom', message: 'A keyword is required', path: ['keyword'] });
  if (p.kind === 'contest') {
    for (const field of ['prize', 'rulesUrl', 'entryUrl', 'eligibility', 'opensAt', 'closesAt', 'winnerText'] as const) {
      if (!p[field]) ctx.addIssue({ code: 'custom', message: `${field} is required for contests`, path: [field] });
    }
    if (p.opensAt && p.closesAt && p.opensAt >= p.closesAt) ctx.addIssue({ code: 'custom', message: 'Closing must follow opening', path: ['closesAt'] });
  }
});
export type SmsProgram = z.infer<typeof programSchema>;

export const appointmentSchema = z.object({
  externalId: z.string().trim().min(1).max(160), version: z.number().int().min(1),
  phone: z.string().transform(normalizePhone), name: z.string().max(160).default(''),
  startsAt: z.iso.datetime({ offset: true }), timezone: timezoneSchema,
  status: z.enum(['scheduled', 'confirmed', 'cancelled']).default('scheduled'),
  reminderConsent: z.boolean(), consentSource: z.string().min(1).max(500),
  offsets: z.array(z.number().int().min(1).max(10080)).min(1).max(5).default([1440, 120]),
  text: textSchema.default('Reminder: your appointment with {{business}} is {{appointment_time}}. Reply CONFIRM to confirm or RESCHEDULE for help. Reply STOP to opt out.'),
});
