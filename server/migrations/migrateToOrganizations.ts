/**
 * Data Migration Script: Migrate Existing Data to Organization Model
 *
 * This script migrates existing users, bots, leads, and conversations
 * to the new multi-tenant organization structure.
 *
 * WARNING: This script should be run ONCE after the schema migration.
 * Make sure to backup your database before running!
 */

import { eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  bots,
  conversations,
  leads,
  organizationMembers,
  organizations,
  users,
} from '../../shared/schema';
import { db } from '../db';

interface MigrationResult {
  success: boolean;
  organizationsCreated: number;
  usersUpdated: number;
  botsUpdated: number;
  leadsUpdated: number;
  conversationsUpdated: number;
  errors: string[];
}

export async function migrateToOrganizations(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    organizationsCreated: 0,
    usersUpdated: 0,
    botsUpdated: 0,
    leadsUpdated: 0,
    conversationsUpdated: 0,
    errors: [],
  };

  console.log('🚀 Starting data migration to organization model...');

  try {
    // Step 1: Get all users without an organization
    console.log('\n📊 Step 1: Finding users without organizations...');
    const usersWithoutOrg = await db
      .select()
      .from(users)
      .where(isNull(users.organizationId));

    console.log(`Found ${usersWithoutOrg.length} users to migrate`);

    // Step 2: Create an organization for each user
    console.log('\n🏢 Step 2: Creating organizations for each user...');
    for (const user of usersWithoutOrg) {
      try {
        const slug = generateSlug(user.companyName || user.name || user.email);

        const [org] = await db
          .insert(organizations)
          .values({
            id: uuidv4(),
            name: user.companyName || `${user.name}'s Organization`,
            slug: slug,
            ownerId: user.id,
            plan: user.plan || 'FREE',
            subscriptionStatus:
              user.status === 'Active' ? 'active' : 'inactive',
            settings: {},
            createdAt: user.createdAt || new Date(),
            updatedAt: new Date(),
          })
          .returning();

        if (!org) {
          throw new Error(`Failed to create organization for user ${user.id}`);
        }

        // Create organization membership for the owner
        await db.insert(organizationMembers).values({
          id: uuidv4(),
          organizationId: org.id,
          userId: user.id,
          role: 'owner',
          permissions: ['*'], // Full permissions for owner
          joinedAt: new Date(),
        });

        // Update user with organization ID
        await db
          .update(users)
          .set({ organizationId: org.id })
          .where(eq(users.id, user.id));

        result.organizationsCreated++;
        result.usersUpdated++;

        console.log(
          `✅ Created organization "${org.name}" for user ${user.email}`,
        );
      } catch (error) {
        const errorMsg = `Failed to create organization for user ${user.id}: ${error}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    // Step 3: Update bots with organization IDs
    console.log('\n🤖 Step 3: Updating bots with organization IDs...');
    const botsWithoutOrg = await db
      .select()
      .from(bots)
      .where(isNull(bots.organizationId));

    console.log(`Found ${botsWithoutOrg.length} bots to update`);

    for (const bot of botsWithoutOrg) {
      try {
        if (!bot.userId) {
          result.errors.push(`Bot ${bot.id} has no userId, skipping`);
          continue;
        }

        const [botOwner] = await db
          .select()
          .from(users)
          .where(eq(users.id, bot.userId));

        if (!botOwner || !botOwner.organizationId) {
          result.errors.push(
            `Bot ${bot.id} owner has no organization, skipping`,
          );
          continue;
        }

        await db
          .update(bots)
          .set({ organizationId: botOwner.organizationId })
          .where(eq(bots.id, bot.id));

        result.botsUpdated++;
      } catch (error) {
        const errorMsg = `Failed to update bot ${bot.id}: ${error}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Updated ${result.botsUpdated} bots`);

    // Step 4: Update leads with organization IDs
    console.log('\n📋 Step 4: Updating leads with organization IDs...');
    const leadsWithoutOrg = await db
      .select()
      .from(leads)
      .where(isNull(leads.organizationId));

    console.log(`Found ${leadsWithoutOrg.length} leads to update`);

    for (const lead of leadsWithoutOrg) {
      try {
        if (!lead.userId) {
          result.errors.push(`Lead ${lead.id} has no userId, skipping`);
          continue;
        }

        const [leadOwner] = await db
          .select()
          .from(users)
          .where(eq(users.id, lead.userId));

        if (!leadOwner || !leadOwner.organizationId) {
          result.errors.push(
            `Lead ${lead.id} owner has no organization, skipping`,
          );
          continue;
        }

        await db
          .update(leads)
          .set({ organizationId: leadOwner.organizationId })
          .where(eq(leads.id, lead.id));

        result.leadsUpdated++;
      } catch (error) {
        const errorMsg = `Failed to update lead ${lead.id}: ${error}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Updated ${result.leadsUpdated} leads`);

    // Step 5: Update conversations with organization IDs
    console.log('\n💬 Step 5: Updating conversations with organization IDs...');
    const conversationsWithoutOrg = await db
      .select()
      .from(conversations)
      .where(isNull(conversations.organizationId));

    console.log(
      `Found ${conversationsWithoutOrg.length} conversations to update`,
    );

    for (const conversation of conversationsWithoutOrg) {
      try {
        if (!conversation.userId) {
          result.errors.push(
            `Conversation ${conversation.id} has no userId, skipping`,
          );
          continue;
        }

        const [convOwner] = await db
          .select()
          .from(users)
          .where(eq(users.id, conversation.userId));

        if (!convOwner || !convOwner.organizationId) {
          result.errors.push(
            `Conversation ${conversation.id} owner has no organization, skipping`,
          );
          continue;
        }

        await db
          .update(conversations)
          .set({ organizationId: convOwner.organizationId })
          .where(eq(conversations.id, conversation.id));

        result.conversationsUpdated++;
      } catch (error) {
        const errorMsg = `Failed to update conversation ${conversation.id}: ${error}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Updated ${result.conversationsUpdated} conversations`);

    result.success = result.errors.length === 0;

    // Print summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Organizations Created: ${result.organizationsCreated}`);
    console.log(`Users Updated: ${result.usersUpdated}`);
    console.log(`Bots Updated: ${result.botsUpdated}`);
    console.log(`Leads Updated: ${result.leadsUpdated}`);
    console.log(`Conversations Updated: ${result.conversationsUpdated}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log('='.repeat(50));

    if (result.errors.length > 0) {
      console.log('\n⚠️ Errors encountered during migration:');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    if (result.success) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(
        '\n⚠️ Migration completed with some errors. Please review the errors above.',
      );
    }

    return result;
  } catch (error) {
    console.error('\n❌ Fatal error during migration:', error);
    result.errors.push(`Fatal error: ${error}`);
    result.success = false;
    return result;
  }
}

/**
 * Generate a unique slug from a string
 */
function generateSlug(str: string): string {
  const baseSlug = str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 90);

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${baseSlug}-${randomSuffix}`;
}

/**
 * CLI entry point for running the migration
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔄 Running organization migration script...\n');

  migrateToOrganizations()
    .then((result) => {
      if (result.success) {
        console.log(
          '\n✨ All done! Your database has been successfully migrated to the organization model.',
        );
        process.exit(0);
      } else {
        console.log(
          '\n⚠️ Migration completed with errors. Please review and fix manually if needed.',
        );
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}
