/**
 * Script to seed default business configuration in Firestore
 * Run with: npx ts-node scripts/customer/seed-business-config.ts [config-name]
 *
 * Examples:
 *   npx ts-node scripts/customer/seed-business-config.ts           # uses configs/default.json
 *   npx ts-node scripts/customer/seed-business-config.ts ksuma     # uses configs/ksuma.json
 *
 * Config files are gitignored to keep business details private.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { BusinessConfigDocument } from '../../src/services/invoice-generator/config.service';

const firestore = new Firestore();
const COLLECTION_NAME = 'business_config';
const DEFAULT_DOC_ID = 'default';

interface ConfigFile {
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

function loadConfig(configName: string): ConfigFile {
  const configPath = path.join(__dirname, '..', '..', 'configs', `${configName}.json`);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: configs/${configName}.json`);
    console.log('\nCreate a config file in services/worker/configs/');
    console.log('Example: configs/ksuma.json');
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

async function seedConfig(configName: string): Promise<void> {
  console.log(`🔧 Seeding business configuration from configs/${configName}.json...\n`);

  const config = loadConfig(configName);

  const businessConfig: BusinessConfigDocument = {
    business: {
      name: config.business.name,
      taxId: config.business.taxId,
      taxStatus: config.business.taxStatus,
      email: config.business.email,
      phone: config.business.phone,
      address: config.business.address,
    },
    invoice: {
      digitalSignatureText: config.invoice.digitalSignatureText,
      generatedByText: config.invoice.generatedByText,
    },
  };

  const docRef = firestore.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const existingDoc = await docRef.get();

  if (existingDoc.exists) {
    console.log('⚠️  Config already exists. Updating...\n');

    await docRef.update({
      ...businessConfig,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log('✅ Business config updated!');
  } else {
    await docRef.set({
      ...businessConfig,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log('✅ Business config created!');
  }

  console.log('\n📋 Configuration:');
  console.log(`   Business: ${businessConfig.business.name}`);
  console.log(`   Tax ID: ${businessConfig.business.taxId}`);
  console.log(`   Status: ${businessConfig.business.taxStatus}`);
  console.log(`   Email: ${businessConfig.business.email}`);
  console.log(`   Phone: ${businessConfig.business.phone}`);
  console.log(`   Address: ${businessConfig.business.address}`);

  console.log('\n🎉 Done! Your invoice generator is now configured.');

  if (config.logoPath) {
    console.log('\n💡 To upload the logo, run:');
    console.log(`   npx ts-node scripts/customer/upload-logo.ts ${config.logoPath}`);
  }
}

// Get config name from args (default: "ksuma")
const configName = process.argv[2] || 'ksuma';

seedConfig(configName)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
