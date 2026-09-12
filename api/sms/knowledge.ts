import { z } from 'zod';
import { previewKnowledge, startBusinessCrawl } from '../knowledge/business.js';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { db, filter, rpc, scoped, SmsError, type SmsUser } from './store.js';

export const ownerScope = (user: SmsUser) => user.organizationId
  ? { organization_id: `eq.${user.organizationId}` }
  : { user_id: `eq.${user.id}`, organization_id: 'is.null' };

export async function smsKnowledge(req: ApiRequest, res: ApiResponse, user: SmsUser, id?: string, action?: string) {
  if (req.method === 'GET' && !id) {
    const [bases, bots] = await Promise.all([
      db(`business_knowledge_bases?${scoped(user.tenant, { select: 'id,name,published_version_id', order: 'created_at' })}`),
      db(`bots?${filter({ ...ownerScope(user), select: 'id,name', order: 'name', limit: '100' })}`),
    ]);
    return res.json({ bases, bots });
  }
  if (req.method === 'POST' && !id) {
    const input = z.object({ name: z.string().trim().min(2).max(160) }).parse(req.body);
    const [base] = await db<Array<{ id: string }>>('business_knowledge_bases', 'POST', { tenant_key: user.tenant, name: input.name });
    return res.status(201).json(base);
  }
  z.uuid().parse(id);
  const [base] = await db<Array<{ id: string }>>(`business_knowledge_bases?${scoped(user.tenant, { id: `eq.${id}` })}`);
  if (!base) throw new SmsError(404, 'Knowledge base not found');
  if (req.method === 'GET') {
    const versions = await db<Array<{ id: string }>>(`business_knowledge_versions?${scoped(user.tenant, { base_id: `eq.${id}`, order: 'created_at.desc', limit: '10' })}`);
    const links = await db(`business_knowledge_links?${scoped(user.tenant, { base_id: `eq.${id}` })}`);
    return res.json({ base, versions, links, review: versions[0] ? await previewKnowledge(user.tenant, versions[0].id) : null });
  }
  if (req.method === 'POST' && action === 'crawl') {
    const { url } = z.object({ url: z.url() }).parse(req.body);
    return res.status(202).json(await startBusinessCrawl(user.tenant, base.id, url));
  }
  if (req.method === 'PATCH' && !action) {
    const { overrides } = z.object({ overrides: z.record(z.string().regex(/^(services|products|prices|hours|locations|contacts|booking|policies|faqs):.{1,200}$/), z.string().trim().min(1).max(8000)) }).parse(req.body);
    if (Object.keys(overrides).length > 500) throw new SmsError(400, 'Too many manual corrections');
    return res.json(await db(`business_knowledge_bases?${scoped(user.tenant, { id: `eq.${id}` })}`, 'PATCH', { overrides }));
  }
  if (req.method === 'POST' && action === 'publish') {
    const { versionId } = z.object({ versionId: z.uuid() }).parse(req.body);
    const review = await previewKnowledge(user.tenant, versionId);
    if (review.base.id !== id) throw new SmsError(404, 'Version not found in this knowledge base');
    if (review.conflicts.length) throw new SmsError(409, 'Resolve conflicting facts before publishing');
    // The RPC checks completed review state and atomically switches the published version.
    return res.json(await rpc('publish_business_knowledge', { p_tenant: user.tenant, p_version: versionId, p_actor: user.id, p_facts: review.facts }));
  }
  if (req.method === 'POST' && action === 'link') {
    const { botId } = z.object({ botId: z.uuid() }).parse(req.body);
    const [bot] = await db<Array<{ id: string }>>(`bots?${filter({ ...ownerScope(user), id: `eq.${botId}`, select: 'id' })}`);
    if (!bot) throw new SmsError(404, 'Business assistant not found');
    const voices = await db<Array<{ id: string }>>(`voice_agents?${filter({ bot_id: `eq.${botId}`, select: 'id' })}`);
    await db('business_knowledge_links?on_conflict=channel,channel_id', 'POST', [
      { tenant_key: user.tenant, base_id: base.id, channel: 'chatbot', channel_id: botId },
      ...voices.map(voice => ({ tenant_key: user.tenant, base_id: base.id, channel: 'voice', channel_id: voice.id })),
    ], 'resolution=merge-duplicates,return=minimal');
    return res.json({ linked: true });
  }
  throw new SmsError(405, 'Method not allowed');
}
