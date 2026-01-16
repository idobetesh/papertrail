/**
 * Invoice counter service
 * Manages sequential invoice numbering with yearly reset
 * Uses Firestore transactions for atomic increment
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { InvoiceCounter } from '../../../../../shared/types';
import logger from '../../logger';

const COLLECTION_NAME = 'invoice_counters';

let firestore: Firestore | null = null;

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

/**
 * Get current year as string
 */
function getCurrentYear(): string {
  return new Date().getFullYear().toString();
}

/**
 * Get the next invoice number atomically
 * Format: {year}{sequence} (e.g., "20261", "20262", ...)
 * Counter resets to 1 on January 1st each year
 */
export async function getNextInvoiceNumber(): Promise<string> {
  const db = getFirestore();
  const year = getCurrentYear();
  const docRef = db.collection(COLLECTION_NAME).doc(year);
  const log = logger.child({ year, collection: COLLECTION_NAME });

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    let counter: number;

    if (doc.exists) {
      const data = doc.data() as InvoiceCounter;
      counter = data.counter + 1;

      log.debug({ previousCounter: data.counter, newCounter: counter }, 'Incrementing counter');

      transaction.update(docRef, {
        counter,
        lastUpdated: FieldValue.serverTimestamp(),
      });
    } else {
      // First invoice of the year
      counter = 1;

      log.info({ counter }, 'Creating new counter for year');

      transaction.set(docRef, {
        counter,
        lastUpdated: FieldValue.serverTimestamp(),
      });
    }

    // Format: year + counter (e.g., "2026" + "1" = "20261")
    const invoiceNumber = `${year}${counter}`;

    log.info({ invoiceNumber }, 'Generated invoice number');

    return invoiceNumber;
  });
}

/**
 * Get current counter value for a year (for display/debugging)
 */
export async function getCurrentCounter(year?: string): Promise<number> {
  const db = getFirestore();
  const targetYear = year || getCurrentYear();
  const docRef = db.collection(COLLECTION_NAME).doc(targetYear);

  const doc = await docRef.get();

  if (!doc.exists) {
    return 0;
  }

  const data = doc.data() as InvoiceCounter;
  return data.counter;
}

/**
 * Check if invoice number already exists
 * Used for validation before generating PDF
 */
export async function invoiceNumberExists(invoiceNumber: string): Promise<boolean> {
  const db = getFirestore();
  const docRef = db.collection('generated_invoices').doc(invoiceNumber);

  const doc = await docRef.get();
  return doc.exists;
}
