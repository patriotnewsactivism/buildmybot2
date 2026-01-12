import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq, or, inArray } from 'drizzle-orm';

async function checkData() {
  console.log('Checking Users Data...');

  // Check Admins
  const admins = await db.select().from(users).where(inArray(users.role, ['ADMIN', 'Admin', 'MasterAdmin']));
  console.log(`Found ${admins.length} admins.`);
  if (admins.length > 0) {
    console.log('Sample admin:', admins[0]);
  } else {
    console.log('No admins found!');
  }

  // Check Partners
  const partners = await db.select().from(users).where(inArray(users.role, ['RESELLER', 'PARTNER']));
  console.log(`Found ${partners.length} partners.`);

  process.exit(0);
}

checkData().catch(console.error);