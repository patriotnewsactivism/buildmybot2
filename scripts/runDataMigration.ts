/**
 * Data Migration Runner
 * Executes the migrateToOrganizations data migration
 */

import '../server/env';


console.log('🔄 Starting Data Migration to Organizations Model...\n');
console.log('⚠️  WARNING: This will modify your database!');
console.log('⚠️  Make sure you have a backup before proceeding.\n');

// Add a small delay to allow user to read the warning
setTimeout(async () => {
  try {
    // Dynamic import AFTER environment variables are loaded
    const { migrateToOrganizations } = await import(
      '../server/migrations/migrateToOrganizations.js'
    );

    const result = await migrateToOrganizations();

    if (result.success) {
      console.log('\n✅ Data migration completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Data migration completed with errors.');
      console.log('Review the errors above and fix manually if needed.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Fatal error during data migration:');
    console.error(error);
    process.exit(1);
  }
}, 1000);
