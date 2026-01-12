import postgres from 'postgres';
import { env } from '../server/env';
import { ADMIN_USERS } from '../server/config/admins';

async function setAdminPermissions() {
  console.log('Setting admin permissions...\n');

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not found!');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 60,
    idle_timeout: 120,
    max_lifetime: 600,
  });

  try {
    // Use centralized admin configuration from server/config/admins.ts
    const adminUsers = ADMIN_USERS;

    console.log('Updating admin permissions for users:\n');

    for (const user of adminUsers) {
      // Check if user exists
      const existingUsers = await sql`
        SELECT id, email, role, name
        FROM users
        WHERE email = ${user.email}
      `;

      if (existingUsers.length === 0) {
        console.log(`⚠️  User ${user.email} does not exist in the database.`);
        console.log(`   Creating user with ${user.description} role...`);

        // Create the user with admin role
        await sql`
          INSERT INTO users (id, email, name, role, plan, status, created_at)
          VALUES (
            gen_random_uuid()::text,
            ${user.email},
            ${user.email.split('@')[0]},
            ${user.role},
            ${user.plan},
            'Active',
            NOW()
          )
        `;
        console.log(`✓ Created user ${user.email} with role: ${user.role}\n`);
      } else {
        const existingUser = existingUsers[0];
        console.log(`Found user: ${existingUser.email}`);
        console.log(`  Current role: ${existingUser.role}`);
        console.log(`  Updating to: ${user.role}`);

        // Update the user's role
        await sql`
          UPDATE users
          SET role = ${user.role},
              plan = ${user.plan},
              status = 'Active'
          WHERE email = ${user.email}
        `;

        console.log(
          `✓ Updated ${user.email} to ${user.description} (${user.role})\n`,
        );
      }
    }

    // Verify the changes
    console.log('Verifying admin permissions:\n');
    const verifyResults = await sql`
      SELECT email, role, name, status, created_at
      FROM users
      WHERE email = ANY(${adminUsers.map((user) => user.email)})
      ORDER BY email
    `;

    console.log('Admin Users:');
    console.log('============================================');
    verifyResults.forEach((user) => {
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.name}`);
      console.log(`Role: ${user.role}`);
      console.log(`Status: ${user.status}`);
      console.log('--------------------------------------------');
    });

    console.log('\n✅ Admin permissions set successfully!');
  } catch (error) {
    console.error('\n❌ Failed to set admin permissions:');
    console.error('Error:', error);
    console.error('Error message:', (error as Error).message);
    console.error('Error stack:', (error as Error).stack);
    process.exit(1);
  } finally {
    await sql.end();
    console.log('\n📡 Connection closed');
  }
}

setAdminPermissions().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
