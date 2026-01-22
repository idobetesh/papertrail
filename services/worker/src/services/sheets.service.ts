/**
 * Google Sheets service for appending invoice data
 */

import { google, sheets_v4 } from 'googleapis';
import type {
  SheetRow,
  InvoiceExtraction,
  GeneratedInvoiceSheetRow,
} from '../../../../shared/types';
import { getConfig } from '../config';
import { getBusinessConfig } from './business-config/config.service';
import logger from '../logger';
import { DEFAULT_CATEGORY } from './llms/utils';

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}

/**
 * Get the Google Sheet ID for a customer
 * Looks up per-customer sheet first, falls back to global sheet if configured
 */
async function getSheetIdForCustomer(chatId: number): Promise<string | null> {
  // Get customer-specific sheet ID from business config
  const businessConfig = await getBusinessConfig(chatId);

  if (businessConfig.business.sheetId) {
    logger.debug({ chatId, sheetId: businessConfig.business.sheetId }, 'Using per-customer sheet');
    return businessConfig.business.sheetId;
  }

  // Fall back to global sheet if configured
  const config = getConfig();
  if (config.sheetId) {
    logger.warn({ chatId }, 'No per-customer sheet configured, using global fallback sheet');
    return config.sheetId;
  }

  // No sheet configured at all
  logger.warn(
    { chatId },
    'No Google Sheet configured for customer (neither per-customer nor global fallback)'
  );
  return null;
}

/**
 * Column headers for the invoice sheet (14 columns)
 */
export const SHEET_HEADERS = [
  'Received At',
  'Invoice Date',
  'Amount',
  'Currency',
  'Invoice Number',
  'Vendor Name',
  'Category',
  'Uploader',
  'Chat Name',
  'Link',
  'Status',
  'LLM Provider',
  'Total Tokens',
  'Cost (USD)',
];

/**
 * Format date as DD/MM/YYYY
 * Prefixed with ' to prevent Google Sheets auto-conversion to serial number
 */
function formatDate(isoString: string | null): string {
  if (!isoString) {
    return '?';
  }

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return '?';
    }

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `'${day}/${month}/${year}`;
  } catch {
    return '?';
  }
}

/**
 * Format datetime as DD/MM/YYYY HH:MM:SS
 * Prefixed with ' to prevent Google Sheets auto-conversion to serial number
 */
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `'${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch {
    return isoString;
  }
}

/**
 * Ensure sheet has headers (auto-add if first row is empty)
 */
async function ensureHeaders(sheetId: string): Promise<void> {
  const sheets = getSheets();

  // Check if sheet has data in first row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Invoices!A1:N1',
  });

  if (
    response.data.values &&
    response.data.values.length > 0 &&
    response.data.values[0].length > 0
  ) {
    // Headers already exist
    return;
  }

  // Add headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Invoices!A1:N1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [SHEET_HEADERS],
    },
  });

  logger.info('Sheet headers added automatically');
}

/**
 * Append a row to the invoice sheet
 */
export async function appendRow(chatId: number, row: SheetRow): Promise<number | undefined> {
  // Get sheet ID for this customer
  const sheetId = await getSheetIdForCustomer(chatId);

  if (!sheetId) {
    logger.warn({ chatId }, 'Skipping Google Sheets append - no sheet configured for customer');
    return undefined;
  }

  const sheets = getSheets();

  // Ensure headers exist
  await ensureHeaders(sheetId);

  const values = [
    [
      row.received_at,
      row.invoice_date,
      row.amount,
      row.currency,
      row.invoice_number,
      row.vendor_name,
      row.category,
      row.uploader,
      row.chat_name,
      row.drive_link,
      row.status,
      row.llm_provider,
      row.total_tokens,
      row.cost_usd,
    ],
  ];

  logger.debug({ chatId, sheetId }, 'Appending row to customer Google Sheet');

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Invoices!A:N', // Columns A through N (14 columns)
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  logger.info('Row appended to Google Sheets');

  // Try to extract row number from updated range
  const updatedRange = response.data.updates?.updatedRange;
  if (updatedRange) {
    const match = updatedRange.match(/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

/**
 * Build a SheetRow from processing data
 */
export function buildSheetRow(params: {
  receivedAt: string;
  uploaderUsername: string;
  chatTitle: string;
  driveLink: string;
  extraction: InvoiceExtraction;
  status: 'processed' | 'needs_review';
  llmProvider: 'gemini' | 'openai';
  totalTokens: number;
  costUSD: number;
}): SheetRow {
  return {
    received_at: formatDateTime(params.receivedAt),
    invoice_date: formatDate(params.extraction.invoice_date),
    amount:
      params.extraction.total_amount !== null ? params.extraction.total_amount.toString() : '?',
    currency: params.extraction.currency || '?',
    invoice_number: params.extraction.invoice_number || '?',
    vendor_name: params.extraction.vendor_name || '?',
    category: params.extraction.category || DEFAULT_CATEGORY,
    uploader: params.uploaderUsername || 'unknown',
    chat_name: params.chatTitle || 'private',
    drive_link: params.driveLink,
    status: params.status,
    llm_provider: params.llmProvider,
    total_tokens: params.totalTokens,
    cost_usd: params.costUSD,
  };
}

// ============================================================================
// Generated Invoices Tab
// ============================================================================

const GENERATED_INVOICES_TAB = 'Generated Invoices';

/**
 * Column headers for the Generated Invoices sheet (11 columns)
 */
export const GENERATED_INVOICES_HEADERS = [
  'Invoice #',
  'Type',
  'Date',
  'Customer',
  'Tax ID',
  'Description',
  'Amount',
  'Payment',
  'Generated By',
  'Generated At',
  'PDF Link',
];

/**
 * Ensure Generated Invoices tab exists with headers
 */
async function ensureGeneratedInvoicesTab(sheetId: string): Promise<void> {
  const sheets = getSheets();

  try {
    // Check if tab exists by trying to read from it
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${GENERATED_INVOICES_TAB}'!A1:K1`,
    });

    if (
      response.data.values &&
      response.data.values.length > 0 &&
      response.data.values[0].length > 0
    ) {
      // Tab and headers already exist
      return;
    }

    // Tab exists but no headers - add them
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${GENERATED_INVOICES_TAB}'!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [GENERATED_INVOICES_HEADERS],
      },
    });

    logger.info('Generated Invoices tab headers added');
  } catch (error) {
    // Tab doesn't exist - create it
    logger.info('Creating Generated Invoices tab');

    // Get spreadsheet to add a new sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: GENERATED_INVOICES_TAB,
              },
            },
          },
        ],
      },
    });

    // Add headers to new tab
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${GENERATED_INVOICES_TAB}'!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [GENERATED_INVOICES_HEADERS],
      },
    });

    logger.info('Generated Invoices tab created with headers');
  }
}

/**
 * Append a row to the Generated Invoices sheet tab
 * @param chatId - Customer's Telegram chat ID
 * @param row - Invoice row data to append
 * @param sheetId - Optional sheet ID (if already known, avoids Firestore read)
 */
export async function appendGeneratedInvoiceRow(
  chatId: number,
  row: GeneratedInvoiceSheetRow,
  sheetId?: string
): Promise<number | undefined> {
  // Get sheet ID for this customer (only if not provided)
  const resolvedSheetId = sheetId || (await getSheetIdForCustomer(chatId));

  if (!resolvedSheetId) {
    logger.warn(
      { chatId },
      'Skipping Generated Invoices append - no sheet configured for customer'
    );
    return undefined;
  }

  const sheets = getSheets();

  // Ensure tab and headers exist
  await ensureGeneratedInvoicesTab(resolvedSheetId);

  const values = [
    [
      row.invoice_number,
      row.document_type,
      `'${row.date}`, // Prefix with ' to prevent date conversion
      row.customer_name,
      row.customer_tax_id || '',
      row.description,
      row.amount,
      row.payment_method,
      row.generated_by,
      formatDateTime(row.generated_at),
      row.pdf_link,
    ],
  ];

  logger.debug(
    { chatId, sheetId: resolvedSheetId },
    'Appending row to customer Generated Invoices tab'
  );

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: resolvedSheetId,
    range: `'${GENERATED_INVOICES_TAB}'!A:K`, // Columns A through K (11 columns)
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  logger.info('Row appended to Generated Invoices tab');

  // Try to extract row number from updated range
  const updatedRange = response.data.updates?.updatedRange;
  if (updatedRange) {
    const match = updatedRange.match(/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}
