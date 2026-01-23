import 'dotenv/config';
import { KnowledgeRepairService } from '../server/services/KnowledgeRepairService';

async function main() {
  const summary = await KnowledgeRepairService.reconcile(50);
  console.log('Knowledge repair summary:', summary);
}

main().catch((error) => {
  console.error('Knowledge repair failed:', error);
  process.exit(1);
});
