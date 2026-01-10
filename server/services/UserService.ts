import { and, desc, eq, isNull, like, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { type InsertUser, type User, users } from '../../shared/schema';
import { db } from '../db';
import { AuditService } from './AuditService';

export class UserService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createUser(
    userData: Partial<InsertUser>,
    createdBy?: string,
  ): Promise<User> {
    const newUser = await db
      .insert(users)
      .values({
        id: uuidv4(),
        ...userData,
        createdAt: new Date(),
      } as InsertUser)
      .returning();

    if (createdBy) {
      await this.auditService.log({
        userId: createdBy,
        organizationId: userData.organizationId,
        action: 'user.created',
        resourceType: 'user',
        resourceId: newUser[0].id,
        newValues: newUser[0],
      });
    }

    return newUser[0];
  }

  async getUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    return user;
  }

  async getUsersByOrganization(organizationId: string): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(
        and(eq(users.organizationId, organizationId), isNull(users.deletedAt)),
      )
      .orderBy(desc(users.createdAt));
  }

  async updateUser(
    userId: string,
    updates: Partial<User>,
    updatedBy: string,
  ): Promise<User> {
    const [oldUser] = await db.select().from(users).where(eq(users.id, userId));

    const [updatedUser] = await db
      .update(users)
      .set({
        ...updates,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await this.auditService.log({
      userId: updatedBy,
      organizationId: oldUser.organizationId,
      action: 'user.updated',
      resourceType: 'user',
      resourceId: userId,
      oldValues: oldUser,
      newValues: updatedUser,
    });

    return updatedUser;
  }

  async deleteUser(userId: string, deletedBy: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, userId));

    await this.auditService.log({
      userId: deletedBy,
      organizationId: user.organizationId,
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
    });
  }

  async restoreUser(userId: string, restoredBy: string): Promise<User> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    const [restoredUser] = await db
      .update(users)
      .set({ deletedAt: null })
      .where(eq(users.id, userId))
      .returning();

    await this.auditService.log({
      userId: restoredBy,
      organizationId: user.organizationId,
      action: 'user.restored',
      resourceType: 'user',
      resourceId: userId,
      newValues: restoredUser,
    });

    return restoredUser;
  }

  async searchUsers(
    searchTerm: string,
    organizationId?: string,
  ): Promise<User[]> {
    const searchPattern = `%${searchTerm}%`;
    const conditions = [
      like(users.name, searchPattern),
      like(users.email, searchPattern),
      like(users.companyName, searchPattern),
    ];

    if (organizationId) {
      return db
        .select()
        .from(users)
        .where(
          and(
            eq(users.organizationId, organizationId),
            isNull(users.deletedAt),
            or(...conditions),
          ),
        )
        .limit(50);
    }

    return db
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), or(...conditions)))
      .limit(50);
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(and(eq(users.role, role), isNull(users.deletedAt)));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }
}
