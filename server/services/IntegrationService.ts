import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { integrations } from '../../shared/schema';
import { db } from '../db';
import { HubSpotProvider } from './integrations/HubSpotProvider';
import type { IntegrationProvider } from './integrations/IntegrationProvider';

export class IntegrationService {
  private providers: Map<string, IntegrationProvider> = new Map();

  constructor() {
    // Register available providers
    this.registerProvider(new HubSpotProvider());
  }

  registerProvider(provider: IntegrationProvider) {
    this.providers.set(provider.id, provider);
  }

  getProviders() {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  async connect(organizationId: string, providerId: string, config: any) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const isValid = await provider.validateCredentials(config);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check if integration already exists
    const [existing] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.organizationId, organizationId),
          eq(integrations.provider, providerId),
        ),
      );

    if (existing) {
      // Update existing
      return db
        .update(integrations)
        .set({ config, isActive: true, updatedAt: new Date() })
        .where(eq(integrations.id, existing.id))
        .returning();
    }
    // Create new
    return db
      .insert(integrations)
      .values({
        id: uuidv4(),
        organizationId,
        provider: providerId,
        config,
        isActive: true,
      })
      .returning();
  }

  async disconnect(organizationId: string, providerId: string) {
    return db
      .update(integrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(integrations.organizationId, organizationId),
          eq(integrations.provider, providerId),
        ),
      );
  }

  async syncLead(lead: any) {
    if (!lead.organizationId) return;

    const activeIntegrations = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.organizationId, lead.organizationId),
          eq(integrations.isActive, true),
        ),
      );

    for (const integration of activeIntegrations) {
      const provider = this.providers.get(integration.provider);
      if (provider) {
        try {
          await provider.createLead(lead, integration.config);
        } catch (error) {
          console.error(
            `Failed to sync lead to ${integration.provider}:`,
            error,
          );
        }
      }
    }
  }
}

export const integrationService = new IntegrationService();
