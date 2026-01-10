import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  type InsertOrganization,
  type Organization,
  type OrganizationMember,
  organizationMembers,
  organizations,
} from '../../shared/schema';
import { db } from '../db';
import { AuditService } from './AuditService';

export class OrganizationService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createOrganization(
    orgData: Omit<InsertOrganization, 'id' | 'createdAt' | 'updatedAt'>,
    ownerId: string,
  ): Promise<Organization> {
    const [newOrg] = await db
      .insert(organizations)
      .values({
        id: uuidv4(),
        ...orgData,
        ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await db.insert(organizationMembers).values({
      id: uuidv4(),
      organizationId: newOrg.id,
      userId: ownerId,
      role: 'owner',
      permissions: ['*'],
      joinedAt: new Date(),
    });

    await this.auditService.log({
      userId: ownerId,
      organizationId: newOrg.id,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: newOrg.id,
      newValues: newOrg,
    });

    return newOrg;
  }

  async getOrganization(orgId: string): Promise<Organization | undefined> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
    return org;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(
        and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
      );
    return org;
  }

  async addMember(
    organizationId: string,
    userId: string,
    role: string,
    permissions: string[],
    invitedBy: string,
  ): Promise<OrganizationMember> {
    const [member] = await db
      .insert(organizationMembers)
      .values({
        id: uuidv4(),
        organizationId,
        userId,
        role,
        permissions,
        invitedBy,
        joinedAt: new Date(),
      })
      .returning();

    await this.auditService.log({
      userId: invitedBy,
      organizationId,
      action: 'organization.member.added',
      resourceType: 'organization_member',
      resourceId: member.id,
      newValues: member,
    });

    return member;
  }

  async removeMember(
    organizationId: string,
    userId: string,
    removedBy: string,
  ): Promise<void> {
    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );

    await this.auditService.log({
      userId: removedBy,
      organizationId,
      action: 'organization.member.removed',
      resourceType: 'organization_member',
      oldValues: { userId },
    });
  }

  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    return db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: string,
    permissions: string[],
    updatedBy: string,
  ): Promise<OrganizationMember> {
    const [updated] = await db
      .update(organizationMembers)
      .set({ role, permissions })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .returning();

    await this.auditService.log({
      userId: updatedBy,
      organizationId,
      action: 'organization.member.role_updated',
      resourceType: 'organization_member',
      resourceId: updated.id,
      newValues: updated,
    });

    return updated;
  }
}
