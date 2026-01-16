/**
 * Business configuration service
 * Loads and caches business config from Firestore
 * Supports logo stored in Cloud Storage
 */

import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import type { BusinessConfig } from '../../../../../shared/types';
import logger from '../../logger';

const COLLECTION_NAME = 'business_config';
const DEFAULT_DOC_ID = 'default';
const LOGO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for logo

let firestore: Firestore | null = null;
let storage: Storage | null = null;
let cachedConfig: BusinessConfig | null = null;
let cachedLogoBase64: string | null = null;
let logoLastFetched: number = 0;

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage();
  }
  return storage;
}

/**
 * Firestore document structure for business config
 */
export interface BusinessConfigDocument {
  business: {
    name: string;
    taxId: string;
    taxStatus: string;
    email: string;
    phone: string;
    address: string;
    logoUrl?: string; // Cloud Storage URL or public URL
  };
  invoice: {
    digitalSignatureText: string;
    generatedByText: string;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Get business configuration from Firestore
 * Caches the config for performance
 */
export async function getBusinessConfig(forceRefresh = false): Promise<BusinessConfig> {
  if (cachedConfig && !forceRefresh) {
    return cachedConfig;
  }

  const db = getFirestore();
  const docRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const log = logger.child({ collection: COLLECTION_NAME, docId: DEFAULT_DOC_ID });

  const doc = await docRef.get();

  if (!doc.exists) {
    log.warn('Business config not found in Firestore, using defaults');
    return getDefaultConfig();
  }

  const data = doc.data() as BusinessConfigDocument;

  cachedConfig = {
    business: {
      name: data.business.name,
      taxId: data.business.taxId,
      taxStatus: data.business.taxStatus,
      email: data.business.email,
      phone: data.business.phone,
      address: data.business.address,
    },
    invoice: {
      digitalSignatureText: data.invoice.digitalSignatureText,
      generatedByText: data.invoice.generatedByText,
    },
  };

  log.info('Business config loaded from Firestore');
  return cachedConfig;
}

/**
 * Get logo as base64 data URL for embedding in HTML
 * Returns null if no logo is configured
 */
export async function getLogoBase64(): Promise<string | null> {
  const now = Date.now();

  // Return cached logo if still valid
  if (cachedLogoBase64 && now - logoLastFetched < LOGO_CACHE_TTL_MS) {
    return cachedLogoBase64;
  }

  const db = getFirestore();
  const docRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const log = logger.child({ function: 'getLogoBase64' });

  try {
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as BusinessConfigDocument;

    if (!data.business.logoUrl) {
      return null;
    }

    // If it's already a data URL, return it directly
    if (data.business.logoUrl.startsWith('data:')) {
      cachedLogoBase64 = data.business.logoUrl;
      logoLastFetched = now;
      return cachedLogoBase64;
    }

    // If it's a Cloud Storage URL (gs://), fetch the file
    if (data.business.logoUrl.startsWith('gs://')) {
      const gcsPath = data.business.logoUrl.replace('gs://', '');
      const [bucketName, ...pathParts] = gcsPath.split('/');
      const filePath = pathParts.join('/');

      const gcs = getStorage();
      const bucket = gcs.bucket(bucketName);
      const file = bucket.file(filePath);

      const [buffer] = await file.download();
      const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

      cachedLogoBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
      logoLastFetched = now;

      log.info({ size: buffer.length }, 'Logo loaded from Cloud Storage');
      return cachedLogoBase64;
    }

    // If it's a public URL, fetch it
    if (data.business.logoUrl.startsWith('http')) {
      const response = await fetch(data.business.logoUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/png';

      cachedLogoBase64 = `data:${contentType};base64,${buffer.toString('base64')}`;
      logoLastFetched = now;

      log.info({ size: buffer.length }, 'Logo loaded from URL');
      return cachedLogoBase64;
    }

    return null;
  } catch (error) {
    log.error({ error }, 'Failed to load logo');
    return null;
  }
}

/**
 * Save or update business configuration in Firestore
 */
export async function saveBusinessConfig(config: BusinessConfigDocument): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const log = logger.child({ collection: COLLECTION_NAME, docId: DEFAULT_DOC_ID });

  const existingDoc = await docRef.get();

  if (existingDoc.exists) {
    await docRef.update({
      ...config,
      updatedAt: FieldValue.serverTimestamp(),
    });
    log.info('Business config updated');
  } else {
    await docRef.set({
      ...config,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    log.info('Business config created');
  }

  // Clear cache
  cachedConfig = null;
  cachedLogoBase64 = null;
}

/**
 * Upload logo to Cloud Storage and update config
 */
export async function uploadLogo(
  buffer: Buffer,
  filename: string,
  bucketName: string
): Promise<string> {
  const gcs = getStorage();
  const bucket = gcs.bucket(bucketName);
  const filePath = `logos/${filename}`;
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
  });

  // Make publicly accessible
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  // Update config with new logo URL
  const db = getFirestore();
  const docRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);

  await docRef.update({
    'business.logoUrl': publicUrl,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Clear cache
  cachedLogoBase64 = null;

  logger.info({ publicUrl }, 'Logo uploaded and config updated');
  return publicUrl;
}

/**
 * Clear cached config (useful for testing or after updates)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedLogoBase64 = null;
  logoLastFetched = 0;
}

/**
 * Get default configuration (fallback)
 */
function getDefaultConfig(): BusinessConfig {
  return {
    business: {
      name: 'עסק לדוגמה',
      taxId: '000000000',
      taxStatus: 'עוסק פטור מס',
      email: 'example@example.com',
      phone: '050-0000000',
      address: 'כתובת לדוגמה',
    },
    invoice: {
      digitalSignatureText: 'מסמך ממוחשב חתום דיגיטלית',
      generatedByText: 'הופק ע"י PaperTrail',
    },
  };
}

/**
 * Check if business config exists in Firestore
 */
export async function hasBusinessConfig(): Promise<boolean> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const doc = await docRef.get();
  return doc.exists;
}
