/**
 * Script to seed business configuration in Firestore
 * Run with: npx ts-node scripts/seed-business-config.ts
 *
 * This creates the initial business_config document in Firestore
 * You can also update logo URL after uploading to Cloud Storage
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { BusinessConfigDocument } from '../src/services/invoice-generator/config.service';

const firestore = new Firestore();
const COLLECTION_NAME = 'business_config';
const DEFAULT_DOC_ID = 'default';

// ===== EDIT YOUR BUSINESS DETAILS HERE =====
const businessConfig: BusinessConfigDocument = {
  business: {
    name: 'צאלה',
    taxId: '206099137',
    taxStatus: 'עוסק פטור מס',
    email: 'tzeelaprojects@gmail.com',
    phone: '0505777928',
    address: 'מודיעין',
    // Optional: Set logo URL after uploading to Cloud Storage
    // logoUrl: 'gs://your-bucket/logos/logo.png',
    // or public URL:
    // logoUrl: 'https://storage.googleapis.com/your-bucket/logos/logo.png',
  },
  invoice: {
    digitalSignatureText: 'מסמך ממוחשב חתום דיגיטלית',
    generatedByText: 'הופק ע"י PaperTrail',
  },
};
// =============================================

async function seedConfig(): Promise<void> {
  console.log('🔧 Seeding business configuration to Firestore...\n');

  const docRef = firestore.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const existingDoc = await docRef.get();

  if (existingDoc.exists) {
    console.log('⚠️  Config already exists. Do you want to overwrite? (Updating...)\n');

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
  console.log(`   Logo: ${businessConfig.business.logoUrl || '(not set)'}`);

  console.log('\n🎉 Done! Your invoice generator is now configured.');
  console.log('\n💡 To update the logo later, run:');
  console.log('   npx ts-node scripts/upload-logo.ts <path-to-logo.png>');
}

seedConfig()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
