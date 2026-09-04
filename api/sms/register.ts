// 10DLC brand + campaign registration -- lets a BuildMyBot tenant register
// for SMS marketing entirely from inside buildmybot.app (they never see
// Telnyx). See api/lib/telephony-provider.ts for the "why" and the carrier
// context (this is a real regulatory requirement, not a Telnyx quirk).
//
// Auth pattern duplicated from api/sms/send.ts / api/phone/activation.ts --
// this codebase does not export a shared auth helper across route files.
//
// GET  -> current brand/campaign status for the authenticated tenant,
//         refreshing from Telnyx first if a registration is still pending.
// POST -> submit business info, registers brand then campaign.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getBrandStatus,
  getCampaignStatus,
  registerBrand,
  registerLowVolumeCampaign,
} from '../lib/telephony-provider.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

interface AuthUser {
  id: string;
  organizationId?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
  });
  return cookies;
}

async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  if (!SESSION_JWT_SECRET || !SUPABASE_SERVICE_KEY || !SUPABASE_URL) return null;
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.bmb_session || cookies.session || null;
  }
  if (!token) return null;
  try {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) return null;
    const expected = createHmac('sha256', SESSION_JWT_SECRET).update(encoded).digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.sub) return null;
    if (payload.exp && Date.now() > Number(payload.exp) * 1000) return null;
    return { id: payload.sub, organizationId: payload.org || undefined };
  } catch {
    return null;
  }
}

function tenantFilter(user: AuthUser): string {
  // Mirrors the unique index in the migration: org scope if present, else
  // user scope.
  return user.organizationId
    ? `organization_id=eq.${encodeURIComponent(user.organizationId)}`
    : `user_id=eq.${encodeURIComponent(user.id)}`;
}

interface BrandRow {
  id: string;
  telnyx_brand_id: string | null;
  company_name: string;
  status: string;
  vetting_score: number | null;
  failure_reason: string | null;
}

interface CampaignRow {
  id: string;
  brand_row_id: string;
  telnyx_campaign_id: string | null;
  usecase: string;
  status: string;
  failure_reason: string | null;
}

async function fetchBrandRow(user: AuthUser): Promise<BrandRow | null> {
  const params = new URLSearchParams({ select: '*', limit: '1' });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/sms_10dlc_brands?${tenantFilter(user)}&${params.toString()}`,
    { headers: SUPABASE_HEADERS },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as BrandRow[];
  return rows[0] || null;
}

async function fetchCampaignRow(brandRowId: string): Promise<CampaignRow | null> {
  const params = new URLSearchParams({
    select: '*',
    brand_row_id: `eq.${brandRowId}`,
    limit: '1',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/sms_10dlc_campaigns?${params.toString()}`, {
    headers: SUPABASE_HEADERS,
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as CampaignRow[];
  return rows[0] || null;
}

async function patchRow(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  }).catch((error) => {
    console.error(`[sms-register] Failed to patch ${table}:`, error instanceof Error ? error.message : error);
  });
}

/** Pulls the latest status from Telnyx for a still-pending registration and
 * persists any change. Best-effort -- a refresh failure just means the UI
 * shows the last-known status, never blocks the response. */
async function refreshStatus(brand: BrandRow, campaign: CampaignRow | null): Promise<{
  brand: BrandRow;
  campaign: CampaignRow | null;
}> {
  if (brand.telnyx_brand_id && brand.status !== 'APPROVED' && brand.status !== 'FAILED') {
    try {
      const latest = await getBrandStatus(brand.telnyx_brand_id);
      if (latest.status !== brand.status) {
        await patchRow('sms_10dlc_brands', brand.id, {
          status: latest.status,
          failure_reason: latest.failureReason || null,
        });
        brand = { ...brand, status: latest.status, failure_reason: latest.failureReason || null };
      }
    } catch (error) {
      console.error('[sms-register] Brand status refresh failed:', error instanceof Error ? error.message : error);
    }
  }

  if (
    campaign?.telnyx_campaign_id &&
    campaign.status !== 'APPROVED' &&
    campaign.status !== 'FAILED'
  ) {
    try {
      const latest = await getCampaignStatus(campaign.telnyx_campaign_id);
      if (latest.status !== campaign.status) {
        await patchRow('sms_10dlc_campaigns', campaign.id, {
          status: latest.status,
          failure_reason: latest.failureReason || null,
        });
        campaign = { ...campaign, status: latest.status, failure_reason: latest.failureReason || null };
      }
    } catch (error) {
      console.error('[sms-register] Campaign status refresh failed:', error instanceof Error ? error.message : error);
    }
  }

  return { brand, campaign };
}

async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const brand = await fetchBrandRow(user);
  if (!brand) {
    return res.status(200).json({ registered: false });
  }
  const campaign = await fetchCampaignRow(brand.id);
  const refreshed = await refreshStatus(brand, campaign);
  return res.status(200).json({
    registered: true,
    brand: {
      companyName: refreshed.brand.company_name,
      status: refreshed.brand.status,
      failureReason: refreshed.brand.failure_reason,
    },
    campaign: refreshed.campaign
      ? {
          usecase: refreshed.campaign.usecase,
          status: refreshed.campaign.status,
          failureReason: refreshed.campaign.failure_reason,
        }
      : null,
    smsReady: refreshed.brand.status === 'APPROVED' && refreshed.campaign?.status === 'APPROVED',
  });
}

interface RegisterBody {
  companyName?: string;
  ein?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  email?: string;
  website?: string;
  description?: string;
  sample1?: string;
  sample2?: string;
  messageFlow?: string;
  helpMessage?: string;
}

const REQUIRED_FIELDS: Array<keyof RegisterBody> = [
  'companyName',
  'ein',
  'phone',
  'street',
  'city',
  'state',
  'postalCode',
  'email',
  'description',
  'sample1',
  'sample2',
  'messageFlow',
  'helpMessage',
];

async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!process.env.TELNYX_API_KEY) {
    return res.status(503).json({ error: 'SMS registration is not configured (TELNYX_API_KEY missing)' });
  }

  const existing = await fetchBrandRow(user);
  if (existing) {
    return res.status(409).json({
      error: 'A brand is already registered for this account',
      status: existing.status,
    });
  }

  const body = (req.body || {}) as RegisterBody;
  const missing = REQUIRED_FIELDS.filter((field) => !body[field]?.trim?.());
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  let brandRowId: string | null = null;

  try {
    const brandResult = await registerBrand({
      companyName: body.companyName!.trim(),
      ein: body.ein!.trim(),
      phone: body.phone!.trim(),
      street: body.street!.trim(),
      city: body.city!.trim(),
      state: body.state!.trim(),
      postalCode: body.postalCode!.trim(),
      email: body.email!.trim(),
      website: body.website?.trim(),
    });

    const insertedBrand = await fetch(`${SUPABASE_URL}/rest/v1/sms_10dlc_brands`, {
      method: 'POST',
      headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: user.organizationId || null,
        user_id: user.organizationId ? null : user.id,
        telnyx_brand_id: brandResult.telnyxBrandId,
        company_name: body.companyName!.trim(),
        status: brandResult.status,
      }),
    });
    const brandRows = (await insertedBrand.json()) as BrandRow[];
    brandRowId = brandRows[0]?.id || null;
    if (!brandRowId) throw new Error('Failed to persist brand registration');

    const campaignResult = await registerLowVolumeCampaign({
      brandId: brandResult.telnyxBrandId,
      description: body.description!.trim(),
      sample1: body.sample1!.trim(),
      sample2: body.sample2!.trim(),
      messageFlow: body.messageFlow!.trim(),
      helpMessage: body.helpMessage!.trim(),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/sms_10dlc_campaigns`, {
      method: 'POST',
      headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({
        brand_row_id: brandRowId,
        organization_id: user.organizationId || null,
        user_id: user.organizationId ? null : user.id,
        telnyx_campaign_id: campaignResult.telnyxCampaignId,
        usecase: 'LOW_VOLUME',
        status: campaignResult.status,
      }),
    });

    return res.status(201).json({
      registered: true,
      brandStatus: brandResult.status,
      campaignStatus: campaignResult.status,
      note: 'Submitted. Carrier approval typically takes 1-7 business days -- check back on this page for status.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    console.error('[sms-register] Registration failed:', message);
    if (brandRowId) {
      await patchRow('sms_10dlc_brands', brandRowId, { status: 'FAILED', failure_reason: message });
    }
    return res.status(502).json({ error: `Telnyx registration failed: ${message}` });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  if (req.method === 'GET') return handleGet(req, res, user);
  if (req.method === 'POST') return handlePost(req, res, user);
  return res.status(405).json({ error: 'Method not allowed' });
}
