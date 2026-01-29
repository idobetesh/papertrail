/**
 * Report Deduplication Service
 * Prevents duplicate callback processing using update_id tracking
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import logger from '../../logger';

let firestore: Firestore | null = null;

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

const COLLECTION = 'processed_callbacks';
const TTL_HOURS = 24; // Keep records for 24 hours

/**
 * Check if a callback has already been processed
 * @param updateId - Telegram update_id
 * @returns true if already processed, false if new
 */
export async function isCallbackProcessed(updateId: number): Promise<boolean> {
  const db = getFirestore();
  const log = logger.child({ updateId, function: 'isCallbackProcessed' });

  try {
    const docRef = db.collection(COLLECTION).doc(String(updateId));
    const doc = await docRef.get();

    if (doc.exists) {
      log.info('Callback already processed (duplicate)');
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error }, 'Failed to check callback deduplication');
    // On error, allow processing (fail open) to avoid blocking legitimate requests
    return false;
  }
}

/**
 * Mark a callback as processed
 * @param updateId - Telegram update_id
 */
export async function markCallbackProcessed(updateId: number): Promise<void> {
  const db = getFirestore();
  const log = logger.child({ updateId, function: 'markCallbackProcessed' });

  try {
    const docRef = db.collection(COLLECTION).doc(String(updateId));
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

    await docRef.set({
      updateId,
      processedAt: FieldValue.serverTimestamp(),
      expiresAt, // For manual cleanup if needed
    });

    log.info('Marked callback as processed');
  } catch (error) {
    log.error({ error }, 'Failed to mark callback as processed');
    // Don't throw - this is non-critical
  }
}
