/**
 * Model Migration Verification Script
 * Verifies GPT-5o Mini migration across codebase
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CheckResult {
  file: string;
  line: number;
  content: string;
  issue: 'old_model' | 'missing_default' | 'ok';
}

const FILES_TO_CHECK = [
  'shared/schema.ts',
  'services/openaiService.ts',
  'constants.ts',
  'components/BotBuilder/BotBuilder.tsx',
  'components/BotBuilder/SimplifiedBotWizard.tsx',
  'components/Chat/FullPageChat.tsx',
  'server/routes/templates.ts',
  'App.tsx',
];

const OLD_MODEL_PATTERNS = [
  /gpt-4o-mini/gi,
  /'gpt-4o-mini'/g,
  /"gpt-4o-mini"/g,
  /default.*gpt-4o-mini/gi,
];

const NEW_MODEL = 'gpt-5o-mini';

async function verifyModelMigration(): Promise<{
  passed: boolean;
  results: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}> {
  const results: CheckResult[] = [];
  let total = 0;
  let passed = 0;
  let failed = 0;

  console.log('🔍 Verifying GPT-5o Mini migration...\n');

  for (const filePath of FILES_TO_CHECK) {
    try {
      const fullPath = join(process.cwd(), filePath);
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Check for old model references
        for (const pattern of OLD_MODEL_PATTERNS) {
          if (
            pattern.test(line) &&
            !line.includes('Legacy') &&
            !line.includes('gpt-4o')
          ) {
            // Allow gpt-4o as a premium option
            if (!line.includes('gpt-4o') || line.includes('gpt-4o-mini')) {
              results.push({
                file: filePath,
                line: index + 1,
                content: line.trim(),
                issue: 'old_model',
              });
              failed++;
              total++;
              return;
            }
          }
        }

        // Check for default model settings
        if (line.includes('default') && line.includes('model')) {
          if (!line.includes(NEW_MODEL) && !line.includes('gpt-4o')) {
            results.push({
              file: filePath,
              line: index + 1,
              content: line.trim(),
              issue: 'missing_default',
            });
            failed++;
            total++;
            return;
          }
        }

        // Mark as passed if contains new model
        if (line.includes(NEW_MODEL)) {
          total++;
        }
      });

      // If no issues found, mark as passed
      if (!results.some((r) => r.file === filePath)) {
        passed++;
      }
    } catch (error) {
      console.error(`❌ Error checking ${filePath}:`, error);
      failed++;
      total++;
    }
  }

  // Summary
  const summary = {
    total: total + FILES_TO_CHECK.length,
    passed: passed,
    failed: failed,
  };

  return {
    passed: failed === 0,
    results,
    summary,
  };
}

// Run verification
verifyModelMigration()
  .then(({ passed, results, summary }) => {
    console.log('\n📊 Migration Verification Results:\n');
    console.log(`✅ Files checked: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}\n`);

    if (results.length > 0) {
      console.log('⚠️  Issues found:\n');
      results.forEach((result) => {
        console.log(`  ${result.file}:${result.line}`);
        console.log(`    ${result.content}`);
        console.log(`    Issue: ${result.issue}\n`);
      });
    }

    if (passed) {
      console.log('✅ Model migration verification PASSED!\n');
      process.exit(0);
    } else {
      console.log('❌ Model migration verification FAILED!\n');
      console.log('Please fix the issues above before deploying.\n');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Verification error:', error);
    process.exit(1);
  });
