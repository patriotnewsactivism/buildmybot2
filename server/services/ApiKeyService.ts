import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  InsertApiKey,
  apiKeys,
  apiRequestLogs,
} from '../../shared/billing-schema';
import { db } from '../db';
import { billingService } from './BillingService';

export class ApiKeyService {
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private generateApiKey(): { key: string; prefix: string; hash: string } {
    const prefix = `bmb_${crypto.randomBytes(4).toString('hex')}`;
    const secret = crypto.randomBytes(24).toString('hex');
    const key = `${prefix}_${secret}`;
    const hash = this.hashKey(key);
    return { key, prefix, hash };
  }

  async createApiKey(
    organizationId: string,
    name: string,
    scopes: string[],
    createdBy: string,
    expiresInDays?: number,
  ) {
    const entitlement = await billingService.checkEntitlement(
      organizationId,
      'api_access',
    );
    if (!entitlement.allowed) {
      throw new Error('API access requires an upgraded plan');
    }

    const { key, prefix, hash } = this.generateApiKey();
    const id = uuid();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        id,
        organizationId,
        name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes,
        createdBy,
        expiresAt,
      })
      .returning();

    return { ...apiKey, key };
  }

  async getApiKeys(organizationId: string) {
    return db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async validateApiKey(key: string): Promise<{
    valid: boolean;
    apiKey?: typeof apiKeys.$inferSelect;
    error?: string;
  }> {
    const hash = this.hashKey(key);
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hash));

    if (!apiKey) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is disabled' };
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id));

    return { valid: true, apiKey };
  }

  async checkScope(apiKeyId: string, requiredScope: string): Promise<boolean> {
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId));
    if (!apiKey) return false;
    const scopes = apiKey.scopes as string[];
    return scopes.includes('*') || scopes.includes(requiredScope);
  }

  async revokeApiKey(apiKeyId: string) {
    const [apiKey] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, apiKeyId))
      .returning();
    return apiKey;
  }

  async deleteApiKey(apiKeyId: string) {
    await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));
  }

  async updateRateLimit(apiKeyId: string, rateLimitPerMin: number) {
    const [apiKey] = await db
      .update(apiKeys)
      .set({ rateLimitPerMin })
      .where(eq(apiKeys.id, apiKeyId))
      .returning();
    return apiKey;
  }

  async logRequest(
    apiKeyId: string,
    organizationId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    ipAddress?: string,
  ) {
    const id = uuid();
    await db.insert(apiRequestLogs).values({
      id,
      apiKeyId,
      organizationId,
      endpoint,
      method,
      statusCode,
      responseTimeMs,
      ipAddress,
    });
  }

  async getRequestLogs(organizationId: string, limit = 100) {
    return db
      .select()
      .from(apiRequestLogs)
      .where(eq(apiRequestLogs.organizationId, organizationId))
      .orderBy(desc(apiRequestLogs.createdAt))
      .limit(limit);
  }

  async getApiUsageStats(organizationId: string) {
    const logs = await db
      .select()
      .from(apiRequestLogs)
      .where(eq(apiRequestLogs.organizationId, organizationId));
    const totalRequests = logs.length;
    const successfulRequests = logs.filter(
      (l) => l.statusCode && l.statusCode >= 200 && l.statusCode < 400,
    ).length;
    const avgResponseTime =
      logs.reduce((sum, l) => sum + (l.responseTimeMs || 0), 0) /
      (totalRequests || 1);
    return {
      totalRequests,
      successfulRequests,
      errorRate:
        totalRequests > 0
          ? ((totalRequests - successfulRequests) / totalRequests) * 100
          : 0,
      avgResponseTime: Math.round(avgResponseTime),
    };
  }
}

export const apiKeyService = new ApiKeyService();
