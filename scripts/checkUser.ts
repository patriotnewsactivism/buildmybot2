import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkUser() {
  try {
    const user = await db.select().from(users).where(eq(users.email, 'mreardon@wtpnews.org'));
    if (user.length > 0) {
      console.log('✅ User exists:', user[0].email);
      console.log('   Role:', user[0].role);
      console.log('   Status:', user[0].status);
      console.log('   Created:', user[0].createdAt);
    } else {
      console.log('❌ User does NOT exist in production database');
      console.log('   Need to run: npm run db:seed');
    }

    // Check total users
    const allUsers = await db.select().from(users);
    console.log('\n📊 Total users in database:', allUsers.length);

  } catch (e: any) {
    console.error('❌ Error:', e.message);
  }
  process.exit(0);
}

checkUser();
