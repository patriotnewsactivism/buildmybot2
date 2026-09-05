import { searchKnowledge } from '../rag.js';
import { db, filter } from '../sms/store.js';

interface BusinessKnowledgeBase {
  id: string;
  tenant_key?: string;
  bot_id?: string | null;
}

/**
 * Answer an inbound SMS from the same RAG corpus used by the selected bot.
 *
 * The SMS release stores a knowledge_base_id so channels can share business
 * knowledge. Some existing databases model that id through
 * business_knowledge_bases -> bot_id, while older deployments used the bot id
 * directly. Resolve the mapping when present and retain the direct-id fallback
 * so an upgrade does not strand already-configured tenants.
 *
 * This adapter deliberately does not invent an answer when retrieval returns
 * no evidence. A short, honest fallback is safer than hallucinating business
 * hours, pricing, policies, or other customer-specific facts over SMS.
 */
export async function answerBusinessSms(
  tenant: string,
  knowledgeBaseId: string,
  question: string,
): Promise<string> {
  let botId = knowledgeBaseId;

  try {
    const rows = await db<BusinessKnowledgeBase[]>(
      `business_knowledge_bases?${filter({
        id: `eq.${knowledgeBaseId}`,
        tenant_key: `eq.${tenant}`,
        select: 'id,tenant_key,bot_id',
        limit: '1',
      })}`,
    );
    if (rows[0]?.bot_id) botId = rows[0].bot_id;
  } catch {
    // Compatibility path: installations that have not introduced the shared
    // mapping table can still use a bot id directly as knowledge_base_id.
  }

  const chunks = await searchKnowledge(botId, question, 3).catch(() => []);
  if (!chunks.length) {
    return "I don't have enough verified business information to answer that yet. A team member can help you directly.";
  }

  const excerpt = chunks
    .join(' ')
    .replace(/[#*_`>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!excerpt) {
    return "I don't have enough verified business information to answer that yet. A team member can help you directly.";
  }

  return excerpt.length <= 600
    ? excerpt
    : `${excerpt.slice(0, 597).trimEnd()}...`;
}
