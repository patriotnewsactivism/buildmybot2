import { and, desc, eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  type InsertBillingPlan,
  InsertEntitlement,
  type InsertOrganizationSubscription,
  InsertUsageLedgerEntry,
  InsertUsagePool,
  billingPlans,
  creditPackages,
  entitlements,
  organizationSubscriptions,
  planFeatures,
  serviceOfferings,
  serviceOrders,
  templatePurchases,
  usageLedger,
  usagePools,
  voiceMinutesPackages,
} from '../../shared/billing-schema';
import { db } from '../db';

export class BillingService {
  async getPlans() {
    return db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.isActive, true))
      .orderBy(billingPlans.sortOrder);
  }

  async getPlanById(planId: string) {
    const [plan] = await db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.id, planId));
    if (!plan) return null;
    const features = await db
      .select()
      .from(planFeatures)
      .where(eq(planFeatures.planId, planId));
    return { ...plan, features };
  }

  async createPlan(data: InsertBillingPlan) {
    const id = uuid();
    const [plan] = await db
      .insert(billingPlans)
      .values({ ...data, id })
      .returning();
    return plan;
  }

  async updatePlan(planId: string, data: Partial<InsertBillingPlan>) {
    const [plan] = await db
      .update(billingPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(billingPlans.id, planId))
      .returning();
    return plan;
  }

  async getOrganizationSubscription(organizationId: string) {
    const [subscription] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, organizationId));
    return subscription;
  }

  async createSubscription(data: InsertOrganizationSubscription) {
    const id = uuid();
    const [subscription] = await db
      .insert(organizationSubscriptions)
      .values({ ...data, id })
      .returning();
    await this.syncEntitlementsFromPlan(data.organizationId, data.planId);
    return subscription;
  }

  async updateSubscription(
    subscriptionId: string,
    data: Partial<InsertOrganizationSubscription>,
  ) {
    const [subscription] = await db
      .update(organizationSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizationSubscriptions.id, subscriptionId))
      .returning();
    return subscription;
  }

  async cancelSubscription(subscriptionId: string) {
    return this.updateSubscription(subscriptionId, { cancelAtPeriodEnd: true });
  }

  async syncEntitlementsFromPlan(organizationId: string, planId: string) {
    const features = await db
      .select()
      .from(planFeatures)
      .where(eq(planFeatures.planId, planId));
    for (const feature of features) {
      const [existing] = await db
        .select()
        .from(entitlements)
        .where(
          and(
            eq(entitlements.organizationId, organizationId),
            eq(entitlements.featureCode, feature.featureCode),
          ),
        );
      if (existing) {
        await db
          .update(entitlements)
          .set({
            isEnabled: feature.isEnabled,
            limitValue: feature.limitValue,
            updatedAt: new Date(),
          })
          .where(eq(entitlements.id, existing.id));
      } else {
        await db.insert(entitlements).values({
          id: uuid(),
          organizationId,
          featureCode: feature.featureCode,
          isEnabled: feature.isEnabled ?? true,
          limitValue: feature.limitValue,
          sourceType: 'plan',
          sourceId: planId,
        });
      }
    }
  }

  async getEntitlements(organizationId: string) {
    return db
      .select()
      .from(entitlements)
      .where(eq(entitlements.organizationId, organizationId));
  }

  async checkEntitlement(
    organizationId: string,
    featureCode: string,
  ): Promise<{ allowed: boolean; limit?: number; usage?: number }> {
    const [entitlement] = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.organizationId, organizationId),
          eq(entitlements.featureCode, featureCode),
        ),
      );
    if (!entitlement || !entitlement.isEnabled) {
      return { allowed: false };
    }
    if (entitlement.limitValue && entitlement.currentUsage !== null) {
      return {
        allowed: entitlement.currentUsage < entitlement.limitValue,
        limit: entitlement.limitValue,
        usage: entitlement.currentUsage,
      };
    }
    return { allowed: true };
  }

  async incrementEntitlementUsage(
    organizationId: string,
    featureCode: string,
    amount = 1,
  ) {
    const [entitlement] = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.organizationId, organizationId),
          eq(entitlements.featureCode, featureCode),
        ),
      );
    if (!entitlement) return null;
    const [updated] = await db
      .update(entitlements)
      .set({
        currentUsage: (entitlement.currentUsage || 0) + amount,
        updatedAt: new Date(),
      })
      .where(eq(entitlements.id, entitlement.id))
      .returning();
    return updated;
  }

  async getUsagePool(organizationId: string, resourceType: string) {
    const [pool] = await db
      .select()
      .from(usagePools)
      .where(
        and(
          eq(usagePools.organizationId, organizationId),
          eq(usagePools.resourceType, resourceType),
        ),
      );
    return pool;
  }

  async createOrUpdateUsagePool(
    organizationId: string,
    resourceType: string,
    credits: number,
  ) {
    const existing = await this.getUsagePool(organizationId, resourceType);
    if (existing) {
      const [updated] = await db
        .update(usagePools)
        .set({
          totalCredits: (existing.totalCredits || 0) + credits,
          updatedAt: new Date(),
        })
        .where(eq(usagePools.id, existing.id))
        .returning();
      await this.recordUsageLedger(
        organizationId,
        existing.id,
        resourceType,
        credits,
        'credit',
        'Credits added',
      );
      return updated;
    }
    const id = uuid();
    const [pool] = await db
      .insert(usagePools)
      .values({
        id,
        organizationId,
        resourceType,
        totalCredits: credits,
        usedCredits: 0,
      })
      .returning();
    await this.recordUsageLedger(
      organizationId,
      id,
      resourceType,
      credits,
      'credit',
      'Initial credits',
    );
    return pool;
  }

  async consumeCredits(
    organizationId: string,
    resourceType: string,
    amount: number,
    description?: string,
  ): Promise<{ success: boolean; remaining?: number }> {
    const pool = await this.getUsagePool(organizationId, resourceType);
    if (!pool) return { success: false };
    const available =
      (pool.totalCredits || 0) -
      (pool.usedCredits || 0) -
      (pool.reservedCredits || 0);
    if (available < amount) return { success: false, remaining: available };
    const [updated] = await db
      .update(usagePools)
      .set({
        usedCredits: (pool.usedCredits || 0) + amount,
        updatedAt: new Date(),
      })
      .where(eq(usagePools.id, pool.id))
      .returning();
    await this.recordUsageLedger(
      organizationId,
      pool.id,
      resourceType,
      -amount,
      'debit',
      description || 'Usage',
    );
    return {
      success: true,
      remaining: (updated.totalCredits || 0) - (updated.usedCredits || 0),
    };
  }

  async recordUsageLedger(
    organizationId: string,
    poolId: string,
    resourceType: string,
    amount: number,
    operationType: string,
    description?: string,
  ) {
    const pool = await this.getUsagePool(organizationId, resourceType);
    const balanceAfter = pool
      ? (pool.totalCredits || 0) - (pool.usedCredits || 0)
      : 0;
    await db.insert(usageLedger).values({
      id: uuid(),
      organizationId,
      poolId,
      resourceType,
      amount,
      balanceAfter,
      operationType,
      description,
    });
  }

  async getVoiceMinutesPackages() {
    return db
      .select()
      .from(voiceMinutesPackages)
      .where(eq(voiceMinutesPackages.isActive, true))
      .orderBy(voiceMinutesPackages.sortOrder);
  }

  async getCreditPackages(resourceType?: string) {
    let query = db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.isActive, true));
    if (resourceType) {
      query = db
        .select()
        .from(creditPackages)
        .where(
          and(
            eq(creditPackages.isActive, true),
            eq(creditPackages.resourceType, resourceType),
          ),
        );
    }
    return query;
  }

  async getServiceOfferings(serviceType?: string) {
    if (serviceType) {
      return db
        .select()
        .from(serviceOfferings)
        .where(
          and(
            eq(serviceOfferings.isActive, true),
            eq(serviceOfferings.serviceType, serviceType),
          ),
        )
        .orderBy(serviceOfferings.sortOrder);
    }
    return db
      .select()
      .from(serviceOfferings)
      .where(eq(serviceOfferings.isActive, true))
      .orderBy(serviceOfferings.sortOrder);
  }

  async createServiceOrder(
    organizationId: string,
    userId: string,
    serviceId: string,
    notes?: string,
  ) {
    const [service] = await db
      .select()
      .from(serviceOfferings)
      .where(eq(serviceOfferings.id, serviceId));
    if (!service) throw new Error('Service not found');
    const id = uuid();
    const [order] = await db
      .insert(serviceOrders)
      .values({
        id,
        organizationId,
        userId,
        serviceId,
        pricePaidCents: service.priceCents,
        notes,
        status: 'pending',
      })
      .returning();
    return order;
  }

  async getServiceOrders(organizationId: string) {
    return db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.organizationId, organizationId))
      .orderBy(desc(serviceOrders.createdAt));
  }

  async updateServiceOrder(
    orderId: string,
    status: string,
    deliveryNotes?: string,
  ) {
    const [order] = await db
      .update(serviceOrders)
      .set({
        status,
        deliveryNotes,
        completedAt: status === 'completed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(serviceOrders.id, orderId))
      .returning();
    return order;
  }

  async recordTemplatePurchase(
    organizationId: string,
    userId: string,
    templateId: string,
    pricePaidCents: number,
  ) {
    const id = uuid();
    const [purchase] = await db
      .insert(templatePurchases)
      .values({
        id,
        organizationId,
        userId,
        templateId,
        pricePaidCents,
      })
      .returning();
    return purchase;
  }

  async hasTemplatePurchase(organizationId: string, templateId: string) {
    const [purchase] = await db
      .select()
      .from(templatePurchases)
      .where(
        and(
          eq(templatePurchases.organizationId, organizationId),
          eq(templatePurchases.templateId, templateId),
        ),
      );
    return !!purchase;
  }

  async getUsageSummary(organizationId: string) {
    const pools = await db
      .select()
      .from(usagePools)
      .where(eq(usagePools.organizationId, organizationId));
    return pools.map((pool) => ({
      resourceType: pool.resourceType,
      total: pool.totalCredits || 0,
      used: pool.usedCredits || 0,
      reserved: pool.reservedCredits || 0,
      available:
        (pool.totalCredits || 0) -
        (pool.usedCredits || 0) -
        (pool.reservedCredits || 0),
    }));
  }
}

export const billingService = new BillingService();
