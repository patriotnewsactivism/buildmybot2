import { and, desc, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { type InsertLead, type Lead, leads } from '../../shared/schema';
import { db } from '../db';
import { AuditService } from './AuditService';

export class LeadService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createLead(
    leadData: Partial<InsertLead>,
    userId: string,
    organizationId?: string,
  ): Promise<Lead> {
    const newLead = await db
      .insert(leads)
      .values({
        id: uuidv4(),
        ...leadData,
        userId,
        organizationId,
        createdAt: new Date(),
      } as InsertLead)
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'lead.created',
      resourceType: 'lead',
      resourceId: newLead[0].id,
      newValues: newLead[0],
    });

    return newLead[0];
  }

  async getLeadsByOrganization(organizationId: string): Promise<Lead[]> {
    return db
      .select()
      .from(leads)
      .where(eq(leads.organizationId, organizationId))
      .orderBy(desc(leads.createdAt));
  }

  async getLeadsByUser(userId: string): Promise<Lead[]> {
    return db
      .select()
      .from(leads)
      .where(eq(leads.userId, userId))
      .orderBy(desc(leads.createdAt));
  }

  async getLead(leadId: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    return lead;
  }

  async updateLead(
    leadId: string,
    updates: Partial<Lead>,
    userId: string,
    organizationId?: string,
  ): Promise<Lead> {
    const [oldLead] = await db.select().from(leads).where(eq(leads.id, leadId));

    const [updatedLead] = await db
      .update(leads)
      .set(updates)
      .where(eq(leads.id, leadId))
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'lead.updated',
      resourceType: 'lead',
      resourceId: leadId,
      oldValues: oldLead,
      newValues: updatedLead,
    });

    return updatedLead;
  }

  async deleteLead(
    leadId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await db.delete(leads).where(eq(leads.id, leadId));

    await this.auditService.log({
      userId,
      organizationId,
      action: 'lead.deleted',
      resourceType: 'lead',
      resourceId: leadId,
    });
  }

  async getLeadsByBot(botId: string): Promise<Lead[]> {
    return db
      .select()
      .from(leads)
      .where(eq(leads.sourceBotId, botId))
      .orderBy(desc(leads.createdAt));
  }

  async getLeadsByStatus(
    organizationId: string,
    status: string,
  ): Promise<Lead[]> {
    return db
      .select()
      .from(leads)
      .where(
        and(eq(leads.organizationId, organizationId), eq(leads.status, status)),
      )
      .orderBy(desc(leads.createdAt));
  }
}
