/**
 * Script to upload business logo to Cloud Storage and update Firestore config
 *
 * Usage:
 *   npx ts-node scripts/customer/upload-logo.ts <path-to-logo.png> [chat_id]
 *
 * Examples:
 *   npx ts-node scripts/customer/upload-logo.ts ./my-logo.png           # Default config
 *   npx ts-node scripts/customer/upload-logo.ts ./my-logo.png -100123   # Customer-specific
 *
 * Supported formats: PNG, JPEG
 */

import * as fs from 'fs';
import * as path from 'path';
import { Storage } from '@google-cloud/storage';
import { Firestore, FieldValue } from '@google-cloud/firestore';

const firestore = new Firestore();
const storage = new Storage();

const COLLECTION_NAME = 'business_config';
const DEFAULT_DOC_ID = 'default';

// Get bucket name from environment or use default
const BUCKET_NAME =
  process.env.GENERATED_INVOICES_BUCKET ||
  `${process.env.GCP_PROJECT_ID || 'your-project'}-generated-invoices`;

async function uploadLogo(): Promise<void> {
  const logoPath = process.argv[2];
  const chatIdArg = process.argv[3];

  if (!logoPath) {
    console.error('❌ Usage: npx ts-node scripts/upload-logo.ts <path-to-logo.png> [chat_id]');
    console.error('');
    console.error('Examples:');
    console.error('   npx ts-node scripts/upload-logo.ts ./my-logo.png');
    console.error('   npx ts-node scripts/customer/upload-logo.ts ./logo.png <chat_id>');
    process.exit(1);
  }

  if (!fs.existsSync(logoPath)) {
    console.error(`❌ File not found: ${logoPath}`);
    process.exit(1);
  }

  const ext = path.extname(logoPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
    console.error('❌ Unsupported format. Please use PNG or JPEG.');
    process.exit(1);
  }

  // Parse optional chat ID
  let chatId: number | undefined;
  let docId = DEFAULT_DOC_ID;

  if (chatIdArg) {
    chatId = parseInt(chatIdArg, 10);
    if (isNaN(chatId)) {
      console.error('❌ Invalid chat ID. Must be a number.');
      process.exit(1);
    }
    docId = `chat_${chatId}`;
  }

  console.log('🔧 Uploading logo...\n');
  console.log(`   File: ${logoPath}`);
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Config: ${docId}`);
  if (chatId) {
    console.log(`   Chat ID: ${chatId}`);
  }

  const buffer = fs.readFileSync(logoPath);
  const filename = `logo${ext}`;

  // Organize logos by chat ID for multi-customer support
  const logoFolder = chatId ? `logos/${chatId}` : 'logos';
  const filePath = `${logoFolder}/${filename}`;

  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    },
  });

  // Note: Bucket has uniform bucket-level access with public read enabled via Terraform
  // No need to call makePublic() on individual files

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`;

  console.log(`\n✅ Logo uploaded: ${publicUrl}`);

  // Update Firestore config
  const docRef = firestore.collection(COLLECTION_NAME).doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    const setupScript = chatId ? `seed-customer-config.ts ${chatId}` : 'seed-business-config.ts';
    console.log(`\n⚠️  Config not found for ${docId}. Run ${setupScript} first.`);
    console.log('   Then run this script again to update the logo.');
    process.exit(1);
  }

  await docRef.update({
    'business.logoUrl': publicUrl,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log('✅ Firestore config updated with logo URL');
  console.log('\n🎉 Done! Your logo will now appear on invoices.');
}

uploadLogo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
