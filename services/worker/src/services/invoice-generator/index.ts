/**
 * Invoice Generator service
 * Main orchestrator for invoice generation flow
 */

import { Storage } from '@google-cloud/storage';
import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';
import * as fs from 'fs';
import * as path from 'path';
import type {
  InvoiceData,
  BusinessConfig,
  GeneratedInvoice,
  InvoiceSession,
} from '../../../../../shared/types';
import { generateInvoicePDFWithConfig } from './pdf.generator';
import { getNextInvoiceNumber } from './counter.service';
import { appendGeneratedInvoiceRow } from '../sheets.service';
import logger from '../../logger';
import { getConfig } from '../../config';

const GENERATED_INVOICES_COLLECTION = 'generated_invoices';

let storage: Storage | null = null;
let firestore: Firestore | null = null;
let businessConfig: BusinessConfig | null = null;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage();
  }
  return storage;
}

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

/**
 * Load business configuration from invoice-config.json
 * Falls back to example config in development
 */
export function loadBusinessConfig(): BusinessConfig {
  if (businessConfig) {
    return businessConfig;
  }

  const configPath = path.resolve(__dirname, '../../../../invoice-config.json');
  const exampleConfigPath = path.resolve(__dirname, '../../../../invoice-config.example.json');

  try {
    // Try to load actual config first
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      businessConfig = JSON.parse(configContent) as BusinessConfig;
      logger.info('Loaded invoice config from invoice-config.json');
    } else if (fs.existsSync(exampleConfigPath)) {
      // Fall back to example config (for development/testing)
      const configContent = fs.readFileSync(exampleConfigPath, 'utf-8');
      businessConfig = JSON.parse(configContent) as BusinessConfig;
      logger.warn('Using example invoice config - create invoice-config.json for production');
    } else {
      throw new Error('No invoice config file found');
    }

    return businessConfig;
  } catch (error) {
    logger.error({ error }, 'Failed to load business config');
    throw new Error(
      `Failed to load invoice config: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY
 */
function formatDateDisplay(date: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) {
    return date;
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Generate invoice from confirmed session data
 * Returns the generated invoice details
 */
export async function generateInvoice(
  session: InvoiceSession,
  userId: number,
  username: string,
  chatId: number
): Promise<{
  invoiceNumber: string;
  pdfUrl: string;
  pdfBuffer: Buffer;
}> {
  const log = logger.child({ chatId, userId, username });
  log.info('Starting invoice generation');

  // Load business config
  const config = loadBusinessConfig();

  // Get next invoice number (atomic)
  const invoiceNumber = await getNextInvoiceNumber();
  log.info({ invoiceNumber }, 'Got invoice number');

  // Build invoice data
  const invoiceData: InvoiceData = {
    invoiceNumber,
    documentType: session.documentType!,
    customerName: session.customerName!,
    customerTaxId: session.customerTaxId,
    description: session.description!,
    amount: session.amount!,
    paymentMethod: session.paymentMethod!,
    date: session.date!,
  };

  // Generate PDF
  const pdfBuffer = await generateInvoicePDFWithConfig(invoiceData, config);
  log.info({ pdfSize: pdfBuffer.length }, 'PDF generated');

  // Upload to Cloud Storage
  const pdfUrl = await uploadPDF(invoiceNumber, pdfBuffer);
  log.info({ pdfUrl }, 'PDF uploaded to storage');

  // Save to Firestore audit log
  await saveInvoiceRecord(invoiceNumber, invoiceData, userId, username, chatId, pdfUrl);
  log.info('Invoice record saved to Firestore');

  // Log to Google Sheets
  await appendGeneratedInvoiceRow({
    invoice_number: invoiceNumber,
    document_type: session.documentType === 'invoice' ? 'חשבונית' : 'חשבונית-קבלה',
    date: formatDateDisplay(session.date!),
    customer_name: session.customerName!,
    customer_tax_id: session.customerTaxId || '',
    description: session.description!,
    amount: session.amount!,
    payment_method: session.paymentMethod!,
    generated_by: username,
    generated_at: new Date().toISOString(),
    pdf_link: pdfUrl,
  });
  log.info('Invoice logged to Sheets');

  return {
    invoiceNumber,
    pdfUrl,
    pdfBuffer,
  };
}

/**
 * Upload PDF to Cloud Storage
 */
async function uploadPDF(invoiceNumber: string, pdfBuffer: Buffer): Promise<string> {
  const config = getConfig();
  const bucketName = config.generatedInvoicesBucket;
  const gcs = getStorage();
  const bucket = gcs.bucket(bucketName);

  const year = new Date().getFullYear();
  const filePath = `${year}/${invoiceNumber}.pdf`;
  const file = bucket.file(filePath);

  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    metadata: {
      invoiceNumber,
      generatedAt: new Date().toISOString(),
    },
  });

  // Make file publicly accessible
  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${filePath}`;
}

/**
 * Save invoice record to Firestore for audit trail
 */
async function saveInvoiceRecord(
  invoiceNumber: string,
  data: InvoiceData,
  userId: number,
  username: string,
  chatId: number,
  storageUrl: string
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(GENERATED_INVOICES_COLLECTION).doc(invoiceNumber);

  const record: GeneratedInvoice = {
    invoiceNumber,
    documentType: data.documentType,
    customerName: data.customerName,
    customerTaxId: data.customerTaxId,
    description: data.description,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    date: formatDateDisplay(data.date),
    generatedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
    generatedBy: {
      telegramUserId: userId,
      username,
      chatId,
    },
    storagePath: `${new Date().getFullYear()}/${invoiceNumber}.pdf`,
    storageUrl,
  };

  await docRef.set(record);
}

/**
 * Get generated invoice by number (for lookup)
 */
export async function getGeneratedInvoice(invoiceNumber: string): Promise<GeneratedInvoice | null> {
  const db = getFirestore();
  const docRef = db.collection(GENERATED_INVOICES_COLLECTION).doc(invoiceNumber);

  const doc = await docRef.get();
  return doc.exists ? (doc.data() as GeneratedInvoice) : null;
}

// Re-export sub-services
export * from './counter.service';
export * from './session.service';
export { generateInvoicePDF } from './pdf.generator';
export { buildInvoiceHTML, escapeHtml } from './template';
