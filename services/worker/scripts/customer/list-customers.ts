/**
 * Script to list all configured customers in Firestore
 *
 * Usage:
 *   npx ts-node scripts/customer/list-customers.ts
 */

import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();
const COLLECTION_NAME = 'business_config';

interface BusinessConfigDocument {
  business: {
    name: string;
    taxId: string;
    taxStatus: string;
    email: string;
    phone: string;
    address: string;
    logoUrl?: string;
  };
  invoice: {
    digitalSignatureText: string;
    generatedByText: string;
  };
  chatId?: number;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
}

async function listCustomers(): Promise<void> {
  console.log('\n📋 Configured Customers\n');
  console.log('─'.repeat(80));

  const snapshot = await firestore.collection(COLLECTION_NAME).get();

  if (snapshot.empty) {
    console.log('No customers configured yet.');
    console.log('\nTo add a customer, run:');
    console.log('  make seed-customer-config CHAT_ID=<chat_id>');
    return;
  }

  const customers: Array<{
    docId: string;
    chatId: number | null;
    name: string;
    taxId: string;
    hasLogo: boolean;
    updatedAt: string;
  }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as BusinessConfigDocument;
    const chatId = doc.id.startsWith('chat_') ? parseInt(doc.id.replace('chat_', ''), 10) : null;

    customers.push({
      docId: doc.id,
      chatId,
      name: data.business.name,
      taxId: data.business.taxId,
      hasLogo: Boolean(data.business.logoUrl),
      updatedAt: data.updatedAt?.toDate?.()?.toLocaleDateString('he-IL') || 'N/A',
    });
  }

  // Sort: default first, then by chat ID
  customers.sort((a, b) => {
    if (a.docId === 'default') {
      return -1;
    }
    if (b.docId === 'default') {
      return 1;
    }
    return (a.chatId || 0) - (b.chatId || 0);
  });

  console.log(
    `${'Doc ID'.padEnd(25)} | ${'Chat ID'.padEnd(20)} | ${'Business Name'.padEnd(20)} | ${'Logo'.padEnd(5)} | Updated`
  );
  console.log('─'.repeat(80));

  for (const customer of customers) {
    const chatIdStr = customer.chatId !== null ? customer.chatId.toString() : '(default)';
    const logoIcon = customer.hasLogo ? '✓' : '✗';

    console.log(
      `${customer.docId.padEnd(25)} | ${chatIdStr.padEnd(20)} | ${customer.name.padEnd(20)} | ${logoIcon.padEnd(5)} | ${customer.updatedAt}`
    );
  }

  console.log('─'.repeat(80));
  console.log(`\nTotal: ${customers.length} customer(s)\n`);
}

listCustomers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
