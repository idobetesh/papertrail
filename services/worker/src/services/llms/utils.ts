/**
 * Shared utilities for LLM providers
 */

import type { InvoiceExtraction } from '../../../../../shared/types';
import logger from '../../logger';

/**
 * Suspicious patterns that may indicate prompt injection attempts
 * These patterns in extracted text could mean the document contained malicious instructions
 */
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now/i,
  /^system:/i,
  /^assistant:/i,
  /^user:/i,
  /forget\s+(all|your|previous)/i,
  /new\s+instructions?:/i,
  /disregard\s+(all|previous)/i,
  /override\s+(all|previous)/i,
  /reveal\s+(your|the)\s+(prompt|instructions|system)/i,
  /what\s+(is|are)\s+your\s+(instructions|prompt)/i,
  /<script/i,
  /javascript:/i,
  /data:text\/html/i,
  /\${.*}/, // Template injection
  /{{.*}}/, // Template injection
];

/**
 * Maximum allowed length for string fields to prevent abuse
 */
const MAX_FIELD_LENGTHS = {
  vendor_name: 200,
  invoice_number: 100,
  currency: 10,
  rejection_reason: 200,
} as const;

/**
 * Valid business expense categories
 */
export const VALID_CATEGORIES = [
  'Food',
  'Transport',
  'Office Supplies',
  'Utilities',
  'Professional Services',
  'Marketing',
  'Technology',
  'Travel',
  'Entertainment',
  'Miscellaneous',
] as const;

/**
 * Default category when extraction fails or returns invalid value
 */
export const DEFAULT_CATEGORY = 'Miscellaneous' as const;

/**
 * Get MIME type from file extension
 */
export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
}

/**
 * Check if a string contains suspicious patterns that may indicate prompt injection
 */
function containsSuspiciousContent(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize a string field: trim, truncate, and check for suspicious content
 * Returns null if suspicious content is detected
 */
function sanitizeStringField(
  value: unknown,
  fieldName: keyof typeof MAX_FIELD_LENGTHS | 'other',
  logContext: Record<string, unknown> = {}
): string | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const trimmed = value.trim();

  // Check for suspicious content
  if (containsSuspiciousContent(trimmed)) {
    logger.warn(
      { fieldName, valuePreview: trimmed.slice(0, 50), ...logContext },
      'Suspicious content detected in extraction field - potential prompt injection'
    );
    return null;
  }

  // Truncate if too long
  const maxLength = fieldName !== 'other' ? MAX_FIELD_LENGTHS[fieldName] : 500;
  if (trimmed.length > maxLength) {
    logger.debug({ fieldName, originalLength: trimmed.length }, 'Truncating overly long field');
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

/**
 * Normalize and validate extraction result
 * Applies sanitization to prevent prompt injection and validates all fields
 */
export function normalizeExtraction(raw: Partial<InvoiceExtraction>): InvoiceExtraction {
  // First, check if this is marked as a valid invoice
  const isInvoice = raw.is_invoice === true;

  // Sanitize rejection reason (if present)
  const rejectionReason = sanitizeStringField(raw.rejection_reason, 'rejection_reason');

  // If not an invoice, return early with rejection
  if (!isInvoice) {
    logger.info(
      { rejectionReason: rejectionReason || 'Document is not an invoice' },
      'Document rejected - not a valid invoice'
    );
    return {
      is_invoice: false,
      rejection_reason: rejectionReason || 'Document does not appear to be an invoice or receipt',
      vendor_name: null,
      invoice_number: null,
      invoice_date: null,
      total_amount: null,
      currency: null,
      vat_amount: null,
      confidence: 0,
      category: null,
    };
  }

  // Check all string fields for suspicious content
  const vendorName = sanitizeStringField(raw.vendor_name, 'vendor_name');
  const invoiceNumber = sanitizeStringField(raw.invoice_number, 'invoice_number');
  const currency = sanitizeStringField(raw.currency, 'currency');

  // If multiple fields contain suspicious content, lower confidence significantly
  const suspiciousFieldCount = [
    vendorName === null && typeof raw.vendor_name === 'string' && raw.vendor_name.trim() !== '',
    invoiceNumber === null &&
      typeof raw.invoice_number === 'string' &&
      raw.invoice_number.trim() !== '',
  ].filter(Boolean).length;

  let confidence =
    typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5;
  if (suspiciousFieldCount > 0) {
    // Lower confidence if suspicious content was detected
    confidence = Math.min(confidence, 0.3);
  }

  return {
    is_invoice: true,
    rejection_reason: null,
    vendor_name: vendorName,
    invoice_number: invoiceNumber,
    invoice_date: normalizeDate(raw.invoice_date),
    total_amount: typeof raw.total_amount === 'number' ? raw.total_amount : null,
    currency: currency?.toUpperCase() || null,
    vat_amount: typeof raw.vat_amount === 'number' ? raw.vat_amount : null,
    confidence,
    category: normalizeCategory(raw.category),
  };
}

/**
 * Normalize and validate category
 * Always returns a valid category - defaults to DEFAULT_CATEGORY for null/invalid input
 */
function normalizeCategory(category: unknown): string {
  if (typeof category !== 'string' || !category) {
    return DEFAULT_CATEGORY;
  }

  const categoryTrimmed = category.trim();

  // Case-insensitive match to handle LLM variations
  const matchedCategory = VALID_CATEGORIES.find(
    (cat) => cat.toLowerCase() === categoryTrimmed.toLowerCase()
  );

  return matchedCategory || DEFAULT_CATEGORY;
}

/**
 * Normalize date to ISO format
 * Handles various formats common in Hebrew/Israeli invoices
 */
export function normalizeDate(date: unknown): string | null {
  if (typeof date !== 'string' || !date) {
    return null;
  }

  const cleanDate = date.trim();

  // Already in ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return cleanDate;
  }

  // DD/MM/YYYY format (slashes)
  const ddmmyyyySlash = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyySlash) {
    const [, day, month, year] = ddmmyyyySlash;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD.MM.YYYY format (dots - common in Israel)
  const ddmmyyyyDot = cleanDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmmyyyyDot) {
    const [, day, month, year] = ddmmyyyyDot;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // MM.YYYY or MM/YYYY format (just month/year - use day 01)
  const mmyyyy = cleanDate.match(/^(\d{1,2})[./](\d{4})$/);
  if (mmyyyy) {
    const [, month, year] = mmyyyy;
    return `${year}-${month.padStart(2, '0')}-01`;
  }

  // Date range like "09/11/2025-08/12/2025" - take the END date
  const dateRange = cleanDate.match(
    /(\d{1,2})[./](\d{1,2})[./](\d{4})[-–](\d{1,2})[./](\d{1,2})[./](\d{4})/
  );
  if (dateRange) {
    const [, , , , endDay, endMonth, endYear] = dateRange;
    return `${endYear}-${endMonth.padStart(2, '0')}-${endDay.padStart(2, '0')}`;
  }

  // Try to parse as Date
  try {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // Ignore parsing errors
  }

  logger.debug({ rawDate: date }, 'Could not parse date format');
  return null;
}
