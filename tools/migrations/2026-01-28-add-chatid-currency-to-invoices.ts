/**
 * Migration: Add chatId and currency fields to existing generated_invoices
 *
 * Background: These fields were missing in the original schema, causing
 * revenue reports to fail (queries filter by chatId).
 *
 * This migration:
 * 1. Scans all documents in generated_invoices collection
 * 2. For documents missing chatId: extracts it from generatedBy.chatId
 * 3. For documents missing currency: sets default 'ILS'
 * 4. Updates the documents with the missing fields
 */

import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();

interface GeneratedInvoiceDoc {
  chatId?: number;
  currency?: string;
  generatedBy: {
    chatId: number;
    telegramUserId: number;
    username: string;
  };
  [key: string]: any;
}

async function migrateGeneratedInvoices() {
  console.log('Starting migration: Add chatId and currency to generated_invoices');
  console.log('='.repeat(70));

  const collection = firestore.collection('generated_invoices');
  const snapshot = await collection.get();

  console.log(`Found ${snapshot.size} documents in generated_invoices collection\n`);

  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of snapshot.docs) {
    processedCount++;
    const data = doc.data() as GeneratedInvoiceDoc;
    const docId = doc.id;

    const updates: any = {};
    const missingFields: string[] = [];

    // Check if chatId is missing
    if (data.chatId === undefined || data.chatId === null) {
      // Extract from generatedBy.chatId
      if (data.generatedBy?.chatId) {
        updates.chatId = data.generatedBy.chatId;
        missingFields.push('chatId');
      } else {
        console.warn(`⚠️  Document ${docId}: Cannot extract chatId (generatedBy.chatId missing)`);
        skippedCount++;
        continue;
      }
    }

    // Check if currency is missing
    if (data.currency === undefined || data.currency === null) {
      updates.currency = 'ILS'; // Default currency
      missingFields.push('currency');
    }

    // Update document if any fields were missing
    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      updatedCount++;
      console.log(`✓ Updated ${docId}: Added ${missingFields.join(', ')}`);
    } else {
      skippedCount++;
      console.log(`- Skipped ${docId}: Already has all required fields`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Migration completed!');
  console.log(`Total documents: ${processedCount}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already complete): ${skippedCount}`);
  console.log('='.repeat(70));
}

// Run migration
migrateGeneratedInvoices()
  .then(() => {
    console.log('\n✅ Migration finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
