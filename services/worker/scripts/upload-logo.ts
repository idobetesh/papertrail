/**
 * Script to upload business logo to Cloud Storage and update Firestore config
 * Run with: npx ts-node scripts/upload-logo.ts <path-to-logo.png>
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

  if (!logoPath) {
    console.error('❌ Usage: npx ts-node scripts/upload-logo.ts <path-to-logo.png>');
    console.error('   Example: npx ts-node scripts/upload-logo.ts ./my-logo.png');
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

  console.log('🔧 Uploading logo...\n');
  console.log(`   File: ${logoPath}`);
  console.log(`   Bucket: ${BUCKET_NAME}`);

  const buffer = fs.readFileSync(logoPath);
  const filename = `logo${ext}`;
  const filePath = `logos/${filename}`;

  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    },
  });

  // Make publicly accessible
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`;

  console.log(`\n✅ Logo uploaded: ${publicUrl}`);

  // Update Firestore config
  const docRef = firestore.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const doc = await docRef.get();

  if (!doc.exists) {
    console.log('\n⚠️  Business config not found. Run seed-business-config.ts first.');
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
