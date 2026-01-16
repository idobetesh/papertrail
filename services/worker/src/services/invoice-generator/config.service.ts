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

// Cache per chat ID
const configCache: Map<string, BusinessConfig> = new Map();
const logoCache: Map<string, { base64: string; fetchedAt: number }> = new Map();

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
 * Get document ID for a chat - either chat-specific or default
 */
function getDocIdForChat(chatId?: number): string {
  return chatId ? `chat_${chatId}` : DEFAULT_DOC_ID;
}

/**
 * Get business configuration from Firestore
 * Looks up by chat ID first, falls back to default config
 * Caches the config for performance
 */
export async function getBusinessConfig(
  chatId?: number,
  forceRefresh = false
): Promise<BusinessConfig> {
  const cacheKey = chatId ? `chat_${chatId}` : 'default';

  if (!forceRefresh && configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }

  const db = getFirestore();
  const log = logger.child({ collection: COLLECTION_NAME, chatId });

  // Try chat-specific config first
  if (chatId) {
    const chatDocRef = db.collection(COLLECTION_NAME).doc(getDocIdForChat(chatId));
    const chatDoc = await chatDocRef.get();

    if (chatDoc.exists) {
      const data = chatDoc.data() as BusinessConfigDocument;
      const config = parseConfigDocument(data);
      configCache.set(cacheKey, config);
      log.info('Business config loaded for chat');
      return config;
    }

    log.debug('No chat-specific config, falling back to default');
  }

  // Fall back to default config
  const defaultDocRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
  const defaultDoc = await defaultDocRef.get();

  if (!defaultDoc.exists) {
    log.warn('Business config not found in Firestore, using defaults');
    return getDefaultConfig();
  }

  const data = defaultDoc.data() as BusinessConfigDocument;
  const config = parseConfigDocument(data);
  configCache.set(cacheKey, config);
  log.info('Default business config loaded');
  return config;
}

/**
 * Parse Firestore document to BusinessConfig
 */
function parseConfigDocument(data: BusinessConfigDocument): BusinessConfig {
  return {
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
}

/**
 * Get logo as base64 data URL for embedding in HTML
 * Looks up by chat ID first, falls back to default
 * Returns null if no logo is configured
 */
export async function getLogoBase64(chatId?: number): Promise<string | null> {
  const now = Date.now();
  const cacheKey = chatId ? `chat_${chatId}` : 'default';

  // Return cached logo if still valid
  const cached = logoCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < LOGO_CACHE_TTL_MS) {
    return cached.base64;
  }

  const db = getFirestore();
  const log = logger.child({ function: 'getLogoBase64', chatId });

  try {
    // Try chat-specific config first
    let logoUrl: string | undefined;

    if (chatId) {
      const chatDocRef = db.collection(COLLECTION_NAME).doc(getDocIdForChat(chatId));
      const chatDoc = await chatDocRef.get();

      if (chatDoc.exists) {
        const data = chatDoc.data() as BusinessConfigDocument;
        logoUrl = data.business.logoUrl;
      }
    }

    // Fall back to default if no chat-specific logo
    if (!logoUrl) {
      const defaultDocRef = db.collection(COLLECTION_NAME).doc(DEFAULT_DOC_ID);
      const defaultDoc = await defaultDocRef.get();

      if (defaultDoc.exists) {
        const data = defaultDoc.data() as BusinessConfigDocument;
        logoUrl = data.business.logoUrl;
      }
    }

    if (!logoUrl) {
      return null;
    }

    const base64 = await fetchLogoAsBase64(logoUrl);

    if (base64) {
      logoCache.set(cacheKey, { base64, fetchedAt: now });
    }

    return base64;
  } catch (error) {
    log.error({ error }, 'Failed to load logo');
    return null;
  }
}

/**
 * Fetch logo from various sources and return as base64
 */
async function fetchLogoAsBase64(logoUrl: string): Promise<string | null> {
  const log = logger.child({ function: 'fetchLogoAsBase64' });
  // If it's already a data URL, return it directly
  if (logoUrl.startsWith('data:')) {
    return logoUrl;
  }

  // If it's a Cloud Storage URL (gs://), fetch the file
  if (logoUrl.startsWith('gs://')) {
    const gcsPath = logoUrl.replace('gs://', '');
    const [bucketName, ...pathParts] = gcsPath.split('/');
    const filePath = pathParts.join('/');

    const gcs = getStorage();
    const bucket = gcs.bucket(bucketName);
    const file = bucket.file(filePath);

    const [buffer] = await file.download();
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    log.info({ size: buffer.length }, 'Logo loaded from Cloud Storage');
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  // If it's a public URL, fetch it
  if (logoUrl.startsWith('http')) {
    const response = await fetch(logoUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/png';

    log.info({ size: buffer.length }, 'Logo loaded from URL');
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  return null;
}

/**
 * Save or update business configuration in Firestore
 * @param config - Business config document
 * @param chatId - Optional chat ID for customer-specific config
 */
export async function saveBusinessConfig(
  config: BusinessConfigDocument,
  chatId?: number
): Promise<void> {
  const db = getFirestore();
  const docId = getDocIdForChat(chatId);
  const docRef = db.collection(COLLECTION_NAME).doc(docId);
  const log = logger.child({ collection: COLLECTION_NAME, docId, chatId });

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

  // Clear cache for this chat
  const cacheKey = chatId ? `chat_${chatId}` : 'default';
  configCache.delete(cacheKey);
  logoCache.delete(cacheKey);
}

/**
 * Upload logo to Cloud Storage and update config
 * @param buffer - Logo file buffer
 * @param filename - Filename for the logo
 * @param bucketName - Cloud Storage bucket name
 * @param chatId - Optional chat ID for customer-specific config
 */
export async function uploadLogo(
  buffer: Buffer,
  filename: string,
  bucketName: string,
  chatId?: number
): Promise<string> {
  const gcs = getStorage();
  const bucket = gcs.bucket(bucketName);

  // Organize logos by chat ID for multi-customer support
  const logoFolder = chatId ? `logos/${chatId}` : 'logos';
  const filePath = `${logoFolder}/${filename}`;
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
  });

  // Note: Bucket has uniform bucket-level access with public read enabled via Terraform

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  // Update config with new logo URL
  const db = getFirestore();
  const docId = getDocIdForChat(chatId);
  const docRef = db.collection(COLLECTION_NAME).doc(docId);

  await docRef.update({
    'business.logoUrl': publicUrl,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Clear cache for this chat
  const cacheKey = chatId ? `chat_${chatId}` : 'default';
  logoCache.delete(cacheKey);

  logger.info({ publicUrl, chatId }, 'Logo uploaded and config updated');
  return publicUrl;
}

/**
 * Clear cached config (useful for testing or after updates)
 * @param chatId - Optional chat ID to clear specific cache, or all if not provided
 */
export function clearConfigCache(chatId?: number): void {
  if (chatId !== undefined) {
    const cacheKey = `chat_${chatId}`;
    configCache.delete(cacheKey);
    logoCache.delete(cacheKey);
  } else {
    configCache.clear();
    logoCache.clear();
  }
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
      generatedByText: 'הופק ע"י Papertrail',
    },
  };
}

/**
 * Check if business config exists in Firestore
 * @param chatId - Optional chat ID to check customer-specific config
 */
export async function hasBusinessConfig(chatId?: number): Promise<boolean> {
  const db = getFirestore();
  const docId = getDocIdForChat(chatId);
  const docRef = db.collection(COLLECTION_NAME).doc(docId);
  const doc = await docRef.get();
  return doc.exists;
}

/**
 * List all customer configs in Firestore
 */
export async function listCustomerConfigs(): Promise<
  Array<{ chatId: number | null; businessName: string }>
> {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTION_NAME).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as BusinessConfigDocument;
    const chatId = doc.id.startsWith('chat_') ? parseInt(doc.id.replace('chat_', ''), 10) : null;

    return {
      chatId,
      businessName: data.business.name,
    };
  });
}
