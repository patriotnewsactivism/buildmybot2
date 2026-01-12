import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { organizationMembers, organizations, users } from '../../shared/schema';
import { db } from '../db';
import { ADMIN_USERS } from '../config/admins';

// Use centralized admin configuration from server/config/admins.ts
const USER_ROLES = ADMIN_USERS;

async function ensureOrganization(
  userId: string,
  userEmail: string,
  userRole: string,
): Promise<string | null> {
  if (userRole === 'MasterAdmin' || userRole === 'ADMIN') {
    return null;
  }

  const orgSlug = userEmail
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
  const orgName = `${orgSlug} Organization`;

  const existingOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  let orgId: string;

  if (existingOrgs.length > 0) {
    orgId = existingOrgs[0].id;
    console.log(
      `  📁 Found existing organization: ${existingOrgs[0].name} (${orgId})`,
    );
  } else {
    orgId = uuidv4();
    await db.insert(organizations).values({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      ownerId: userId,
      plan: userRole === 'RESELLER' ? 'PROFESSIONAL' : 'FREE', // Organization plan logic
      subscriptionStatus: 'active',
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`  📁 Created organization: ${orgName} (${orgId})`);
  }

  return orgId;
}

async function addOrganizationMember(
  orgId: string,
  userId: string,
): Promise<void> {
  const existingMembers = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  if (existingMembers.length === 0) {
    await db.insert(organizationMembers).values({
      id: uuidv4(),
      organizationId: orgId,
      userId: userId,
      role: 'owner',
      permissions: ['*'],
      joinedAt: new Date(),
    });
    console.log('  👤 Added user as organization owner');
  } else {
    console.log('  👤 User already a member of an organization');
  }
}

export async function seedUserRoles() {
  console.log('🌱 Seeding user roles...\n');

  try {
    for (const userConfig of USER_ROLES) {
      console.log(`Processing: ${userConfig.email}`);

      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, userConfig.email))
        .limit(1);

      if (existingUsers.length === 0) {
        console.log(
          `  ⚠️  User ${userConfig.email} does not exist in the database.`,
        );
        console.log(
          `  📝 Creating user with ${userConfig.description} role...`,
        );

        const userId = uuidv4();

        let orgId: string | null = null;
        if (userConfig.role !== 'MasterAdmin' && userConfig.role !== 'ADMIN') {
          orgId = await ensureOrganization(
            userId,
            userConfig.email,
            userConfig.role,
          );
        }

        await db.insert(users).values({
          id: userId,
          email: userConfig.email,
          name: userConfig.email.split('@')[0],
          role: userConfig.role,
          plan: userConfig.plan, // Use plan from admin config
          status: 'Active',
          companyName: '',
          organizationId: orgId,
          createdAt: new Date(),
        });

        if (orgId) {
          await addOrganizationMember(orgId, userId);
        }

        console.log(
          `  ✅ Created user ${userConfig.email} with role: ${userConfig.role}\n`,
        );
      } else {
        const existingUser = existingUsers[0];
        console.log(`  Found user: ${existingUser.email}`);
        console.log(`  Current role: ${existingUser.role}`);

        if (existingUser.role === userConfig.role) {
          console.log('  ✅ Role already correct, no update needed\n');
          continue;
        }

        console.log(`  Updating to: ${userConfig.role}`);

        let orgId: string | null = null;
        if (userConfig.role !== 'MasterAdmin' && userConfig.role !== 'ADMIN') {
          orgId = await ensureOrganization(
            existingUser.id,
            userConfig.email,
            userConfig.role,
          );
          if (orgId) {
            await addOrganizationMember(orgId, existingUser.id);
          }
        }

        await db
          .update(users)
          .set({
            role: userConfig.role,
            status: 'Active',
            organizationId: orgId || existingUser.organizationId,
          })
          .where(eq(users.email, userConfig.email));

        console.log(
          `  ✅ Updated ${userConfig.email} to ${userConfig.description} (${userConfig.role})\n`,
        );
      }
    }

    console.log('Verifying user roles:\n');
    console.log('============================================');

    for (const userConfig of USER_ROLES) {
      const verifyUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, userConfig.email))
        .limit(1);

      if (verifyUsers.length > 0) {
        const user = verifyUsers[0];
        console.log(`Email: ${user.email}`);
        console.log(`Name: ${user.name}`);
        console.log(`Role: ${user.role}`);
        console.log(`Status: ${user.status}`);
        console.log(`Organization ID: ${user.organizationId || 'None'}`);
        console.log('--------------------------------------------');
      }
    }

    console.log('\n✅ User roles seeded successfully!');
  } catch (error) {
    console.error('\n❌ Failed to seed user roles:');
    console.error('Error:', error);
    throw error;
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  seedUserRoles()
    .then(() => {
      console.log('✅ Seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}
