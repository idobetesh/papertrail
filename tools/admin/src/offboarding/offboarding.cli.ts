#!/usr/bin/env ts-node
/**
 * Offboarding CLI - Interactive command-line interface for data deletion
 * Wraps the OffboardingService with user-friendly prompts and confirmations
 */

import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import * as readline from 'readline';
import { OffboardingService, OffboardingPreview, OffboardingReport } from './offboarding.service';

// Environment configuration
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'papertrail-invoice';
const INVOICES_BUCKET = process.env.STORAGE_BUCKET || `${PROJECT_ID}-invoices`;
const GENERATED_BUCKET =
  process.env.GENERATED_INVOICES_BUCKET || `${PROJECT_ID}-generated-invoices`;

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

function printSeparator() {
  console.log('\n' + '='.repeat(80) + '\n');
}

function printPreview(preview: OffboardingPreview) {
  printSeparator();
  console.log(`🎯 ${preview.mode === 'business' ? 'BUSINESS' : 'USER'} OFFBOARDING PREVIEW`);
  printSeparator();
  console.log(`Identifier: ${preview.identifier}`);
  console.log(`Name: ${preview.name}`);

  if (preview.associatedUsers && preview.associatedUsers.length > 0) {
    console.log(`\n👥 Associated Users (${preview.associatedUsers.length}):`);
    preview.associatedUsers.forEach((user) => console.log(`   - ${user}`));
  }

  if (preview.associatedBusinesses && preview.associatedBusinesses.length > 0) {
    console.log(`\n🏢 Associated Businesses (${preview.associatedBusinesses.length}):`);
    preview.associatedBusinesses.forEach((biz) => console.log(`   - ${biz}`));
  }

  console.log('\n📄 Firestore Collections:');
  if (Object.keys(preview.collections).length === 0) {
    console.log('   (none)');
  } else {
    for (const [collection, data] of Object.entries(preview.collections)) {
      console.log(`   ${collection}: ${data.count} document(s)`);
      if (data.docIds.length <= 5) {
        data.docIds.forEach((id) => console.log(`      - ${id}`));
      } else {
        data.docIds.slice(0, 3).forEach((id) => console.log(`      - ${id}`));
        console.log(`      ... and ${data.docIds.length - 3} more`);
      }
    }
  }

  console.log('\n🗄️  Cloud Storage:');
  if (Object.keys(preview.storage).length === 0) {
    console.log('   (none)');
  } else {
    for (const [bucket, data] of Object.entries(preview.storage)) {
      console.log(`   ${bucket}: ${data.count} file(s)`);
      if (data.paths.length <= 5) {
        data.paths.forEach((path) => console.log(`      - ${path}`));
      } else {
        data.paths.slice(0, 3).forEach((path) => console.log(`      - ${path}`));
        console.log(`      ... and ${data.paths.length - 3} more`);
      }
    }
  }

  printSeparator();
  console.log('📊 TOTAL ITEMS TO DELETE:', preview.totalItems);
  printSeparator();
}

function printReport(report: OffboardingReport) {
  printSeparator();
  console.log('✅ OFFBOARDING COMPLETE');
  printSeparator();
  console.log(`Mode: ${report.mode === 'business' ? 'Business' : 'User (GDPR)'}`);
  console.log(`Identifier: ${report.identifier}`);
  console.log(`\nDocuments deleted: ${report.firestoreDocs}`);
  console.log(`Documents updated: ${report.firestoreUpdates}`);
  console.log(`Files deleted: ${report.storageFiles}`);

  if (report.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${report.errors.length}`);
    report.errors.forEach((error) => console.log(`   - ${error}`));
  }

  console.log('\n🎉 Operation completed successfully.');
  printSeparator();
}

async function offboardBusinessCLI(chatId: string) {
  const firestore = new Firestore({ projectId: PROJECT_ID });
  const storage = new Storage();
  const service = new OffboardingService(firestore, storage, INVOICES_BUCKET, GENERATED_BUCKET);

  const chatIdNum = parseInt(chatId, 10);

  console.log('\n🔍 Scanning for data...\n');
  const preview = await service.previewBusinessOffboarding(chatIdNum);

  printPreview(preview);

  if (preview.totalItems === 0) {
    console.log('ℹ️  No data found for this business.');
    console.log('ℹ️  Running cleanup to remove any empty folder artifacts...\n');

    await service.offboardBusiness(chatIdNum);
    console.log('\n✅ Cleanup complete.\n');
    return;
  }

  console.log('⚠️  WARNING: This action is IRREVERSIBLE!');
  console.log('⚠️  The business and all its data will be PERMANENTLY DELETED.\n');

  const confirmed = await confirm('Type "yes" to proceed: ');

  if (!confirmed) {
    console.log('\n❌ Operation cancelled.\n');
    return;
  }

  console.log('\n🔥 Executing deletion...\n');
  const report = await service.offboardBusiness(chatIdNum);

  printReport(report);
}

async function offboardUserCLI(userId: string) {
  const firestore = new Firestore({ projectId: PROJECT_ID });
  const storage = new Storage();
  const service = new OffboardingService(firestore, storage, INVOICES_BUCKET, GENERATED_BUCKET);

  const userIdNum = parseInt(userId, 10);

  console.log('\n🔍 Scanning for user data...\n');
  const preview = await service.previewUserOffboarding(userIdNum);

  printPreview(preview);

  if (preview.totalItems === 0) {
    console.log('ℹ️  No data found for this user.');
    console.log('ℹ️  Running cleanup to remove any empty folder artifacts...\n');

    await service.offboardUser(userIdNum);
    console.log('\n✅ Cleanup complete.\n');
    return;
  }

  console.log('⚠️  WARNING: This action is IRREVERSIBLE!');
  console.log('⚠️  All personal data for this user will be PERMANENTLY DELETED.');
  console.log('⚠️  This is GDPR Right to Erasure compliance.\n');

  const confirmed = await confirm('Type "yes" to proceed: ');

  if (!confirmed) {
    console.log('\n❌ Operation cancelled.\n');
    return;
  }

  console.log('\n🔥 Executing deletion...\n');
  const report = await service.offboardUser(userIdNum);

  printReport(report);
}

async function main() {
  printSeparator();
  console.log('🔥 GDPR-COMPLIANT OFFBOARDING');
  printSeparator();

  const args = process.argv.slice(2);
  const chatIdIndex = args.indexOf('--chat-id');
  const userIdIndex = args.indexOf('--user-id');

  if (chatIdIndex !== -1 && args[chatIdIndex + 1]) {
    await offboardBusinessCLI(args[chatIdIndex + 1]);
  } else if (userIdIndex !== -1 && args[userIdIndex + 1]) {
    await offboardUserCLI(args[userIdIndex + 1]);
  } else {
    console.error('\n❌ Error: Missing required argument');
    console.error('\nUsage:');
    console.error('  npx ts-node offboarding.cli.ts --chat-id <chatId>   (Offboard business)');
    console.error('  npx ts-node offboarding.cli.ts --user-id <userId>   (Offboard user - GDPR)');
    console.error('\nExamples:');
    console.error('  npx ts-node offboarding.cli.ts --chat-id -1003612582263');
    console.error('  npx ts-node offboarding.cli.ts --user-id 1069523608\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}
