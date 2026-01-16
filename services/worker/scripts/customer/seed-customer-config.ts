/**
 * Script to seed customer configuration in Firestore
 *
 * Usage:
 *   npx ts-node scripts/customer/seed-customer-config.ts <chat_id>
 *
 * The script reads from configs/customer-{chat_id}.json
 * Or falls back to invoice-config.example.json if no specific file exists
 */

import * as fs from 'fs';
import * as path from 'path';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

const firestore = new Firestore();
const storage = new Storage();

const COLLECTION_NAME = 'business_config';

interface CustomerConfig {
  chatId: number;
  business: {
    name: string;
    taxId: string;
    taxStatus: string;
    email: string;
    phone: string;
    address: string;
  };
  invoice: {
    digitalSignatureText: string;
    generatedByText: string;
  };
  logoPath?: string;
}

async function uploadLogoToStorage(
  logoPath: string,
  chatId: number,
  bucketName: string
): Promise<string> {
  // Resolve logo path relative to project root (services/worker is cwd)
  const absolutePath = path.resolve(process.cwd(), logoPath);

  if (!fs.existsSync(absolutePath)) {
    // Try relative to project root (../../ from services/worker)
    const altPath = path.resolve(process.cwd(), '..', '..', logoPath);
    if (fs.existsSync(altPath)) {
      return uploadLogoFromPath(altPath, chatId, bucketName);
    }
    console.warn(`⚠️  Logo file not found: ${absolutePath}`);
    return '';
  }

  return uploadLogoFromPath(absolutePath, chatId, bucketName);
}

async function uploadLogoFromPath(
  absolutePath: string,
  chatId: number,
  bucketName: string
): Promise<string> {
  const buffer = fs.readFileSync(absolutePath);
  const filename = path.basename(logoPath);
  const filePath = `logos/${chatId}/${filename}`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
  });

  // Note: Bucket has uniform bucket-level access with public read enabled via Terraform

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
  console.log(`✅ Logo uploaded: ${publicUrl}`);

  return publicUrl;
}

async function seedConfig(chatId: number): Promise<void> {
  console.log(`\n🔧 Seeding customer configuration for chat ${chatId}...\n`);

  // Look for customer-specific config file (up 2 levels from scripts/customer/)
  const configsDir = path.join(__dirname, '..', '..', 'configs');
  const specificConfigPath = path.join(configsDir, `customer-${chatId}.json`);
  const defaultConfigPath = path.join(__dirname, '..', '..', 'invoice-config.example.json');

  let configPath: string;

  if (fs.existsSync(specificConfigPath)) {
    configPath = specificConfigPath;
    console.log(`📄 Using config: configs/customer-${chatId}.json`);
  } else if (fs.existsSync(defaultConfigPath)) {
    configPath = defaultConfigPath;
    console.log(`📄 Using default config: invoice-config.example.json`);
    console.log(`💡 Tip: Create configs/customer-${chatId}.json for custom settings`);
  } else {
    console.error('❌ No config file found!');
    console.log('\nCreate one of these files:');
    console.log(`  - configs/customer-${chatId}.json`);
    console.log('  - invoice-config.example.json');
    process.exit(1);
  }

  const config: CustomerConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Override chatId from command line
  config.chatId = chatId;

  // Get bucket name from environment or use default pattern
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const bucketName = process.env.GCS_BUCKET_NAME || `${projectId}-generated-invoices`;

  // Upload logo if specified
  let logoUrl = '';
  if (config.logoPath) {
    try {
      logoUrl = await uploadLogoToStorage(config.logoPath, chatId, bucketName);
    } catch (error) {
      console.warn('⚠️  Failed to upload logo:', error);
    }
  }

  // Save to Firestore
  const docId = `chat_${chatId}`;
  const docRef = firestore.collection(COLLECTION_NAME).doc(docId);
  const existingDoc = await docRef.get();

  const firestoreData = {
    business: {
      ...config.business,
      ...(logoUrl && { logoUrl }),
    },
    invoice: config.invoice,
    chatId,
  };

  if (existingDoc.exists) {
    await docRef.update({
      ...firestoreData,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('\n✅ Customer config updated!');
  } else {
    await docRef.set({
      ...firestoreData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('\n✅ Customer config created!');
  }

  console.log('\n📋 Configuration:');
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Business: ${config.business.name}`);
  console.log(`   Tax ID: ${config.business.taxId}`);
  console.log(`   Status: ${config.business.taxStatus}`);
  console.log(`   Email: ${config.business.email}`);
  console.log(`   Phone: ${config.business.phone}`);
  console.log(`   Address: ${config.business.address}`);
  console.log(`   Logo: ${logoUrl || '(not set)'}`);

  console.log('\n🎉 Done! Customer is now configured.');
}

// Parse command line arguments
const chatIdArg = process.argv[2];

if (!chatIdArg) {
  console.log('Usage: npx ts-node scripts/seed-customer-config.ts <chat_id>');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/seed-customer-config.ts 123456789');
  console.log('  npx ts-node scripts/customer/seed-customer-config.ts <chat_id>');
  console.log('');
  console.log('The script reads from:');
  console.log('  1. configs/customer-{chat_id}.json (if exists)');
  console.log('  2. invoice-config.example.json (fallback)');
  process.exit(1);
}

const chatId = parseInt(chatIdArg, 10);

if (isNaN(chatId)) {
  console.error('❌ Invalid chat ID. Must be a number.');
  process.exit(1);
}

seedConfig(chatId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
