import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { bots, knowledgeChunks, leads } from '../../shared/schema';
import { db } from '../db';

export interface SearchResults {
  bots: any[];
  leads: any[];
  knowledge: any[];
}

export class SearchService {
  async unifiedSearch(
    organizationId: string,
    query: string,
  ): Promise<SearchResults> {
    const searchTerm = `%${query}%`;

    const [botResults, leadResults, knowledgeResults] = await Promise.all([
      this.searchBots(organizationId, searchTerm),
      this.searchLeads(organizationId, searchTerm),
      this.searchKnowledge(organizationId, searchTerm),
    ]);

    return {
      bots: botResults,
      leads: leadResults,
      knowledge: knowledgeResults,
    };
  }

  private async searchBots(organizationId: string, searchTerm: string) {
    return db
      .select()
      .from(bots)
      .where(
        and(
          eq(bots.organizationId, organizationId),
          isNull(bots.deletedAt),
          or(
            ilike(bots.name, searchTerm),
            ilike(bots.type, searchTerm),
            ilike(bots.systemPrompt, searchTerm),
          ),
        ),
      )
      .limit(10);
  }

  private async searchLeads(organizationId: string, searchTerm: string) {
    return db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, organizationId),
          or(
            ilike(leads.name, searchTerm),
            ilike(leads.email, searchTerm),
            ilike(leads.phone, searchTerm),
          ),
        ),
      )
      .limit(10);
  }

  private async searchKnowledge(organizationId: string, searchTerm: string) {
    // This joined query finds knowledge chunks belonging to bots in the organization
    return db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        botId: knowledgeChunks.botId,
        botName: bots.name,
      })
      .from(knowledgeChunks)
      .innerJoin(bots, eq(knowledgeChunks.botId, bots.id))
      .where(
        and(
          eq(bots.organizationId, organizationId),
          isNull(bots.deletedAt),
          ilike(knowledgeChunks.content, searchTerm),
        ),
      )
      .limit(10);
  }
}

export const searchService = new SearchService();
