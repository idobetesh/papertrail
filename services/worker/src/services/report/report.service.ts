/**
 * Report Service
 * Core business logic for report generation
 */

import { Firestore, Timestamp } from '@google-cloud/firestore';
import type {
  ReportData,
  ReportMetrics,
  DateRange,
  InvoiceForReport,
} from '../../../../../shared/report.types';
import type { InvoiceJob } from '../../../../../shared/processing.types';
import logger from '../../logger';

const COLLECTION_NAME = 'invoice_jobs';

let firestore: Firestore | null = null;

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}

/**
 * Get date range for preset
 */
export function getDateRangeForPreset(preset: string): DateRange {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (preset) {
    case 'this_month': {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0); // Last day of month
      return {
        start: formatDate(start),
        end: formatDate(end),
        preset: 'this_month',
      };
    }
    case 'last_month': {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return {
        start: formatDate(start),
        end: formatDate(end),
        preset: 'last_month',
      };
    }
    case 'ytd': {
      // Year-to-Date: Jan 1 to today
      const start = new Date(year, 0, 1);
      const end = new Date(year, month, now.getDate());
      return {
        start: formatDate(start),
        end: formatDate(end),
        preset: 'ytd',
      };
    }
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate custom date range
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @param userEarliestDate Optional: User's earliest invoice date (limits min selection)
 * @returns { valid: true } or { valid: false, error: string }
 */
export function validateCustomDateRange(
  startDate: string,
  endDate: string,
  userEarliestDate?: string | null
): { valid: boolean; error?: string; dateRange?: DateRange; earliestAllowed?: string } {
  // 1. Check format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: 'invalid_format' };
  }

  // 2. Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // 3. Check if valid dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'invalid_date' };
  }

  // 4. Check if start is before or equal to end
  if (start > end) {
    return { valid: false, error: 'start_after_end' };
  }

  // 5. Check if dates are not in the future
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  if (end > today) {
    return { valid: false, error: 'future_date' };
  }

  // 6. Check maximum range (e.g., 2 years)
  const maxRangeDays = 730; // 2 years
  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (rangeDays > maxRangeDays) {
    return { valid: false, error: 'range_too_large' };
  }

  // 7. Check minimum date based on user's earliest invoice
  if (userEarliestDate) {
    const userMin = new Date(userEarliestDate);
    userMin.setHours(0, 0, 0, 0); // Start of day
    if (start < userMin) {
      return {
        valid: false,
        error: 'before_first_invoice',
        earliestAllowed: userEarliestDate,
      };
    }
  } else {
    // Fallback: not before year 2000
    const minYear = 2000;
    if (start.getFullYear() < minYear) {
      return { valid: false, error: 'date_too_old' };
    }
  }

  return {
    valid: true,
    dateRange: {
      start: startDate,
      end: endDate,
      preset: 'custom',
    },
  };
}

/**
 * Validate custom date range for a specific user/chat
 * Automatically fetches user's earliest invoice date
 */
export async function validateCustomDateRangeForUser(
  chatId: number,
  startDate: string,
  endDate: string
): Promise<{ valid: boolean; error?: string; dateRange?: DateRange; earliestAllowed?: string }> {
  const earliestDate = await getEarliestInvoiceDate(chatId);

  if (!earliestDate) {
    // No invoices yet - can't generate report
    return {
      valid: false,
      error: 'no_invoices',
    };
  }

  return validateCustomDateRange(startDate, endDate, earliestDate);
}

/**
 * Get the earliest invoice date for a chat
 * Used to limit calendar date selection
 * @returns Date string (YYYY-MM-DD) or null if no invoices
 */
export async function getEarliestInvoiceDate(chatId: number): Promise<string | null> {
  const db = getFirestore();
  const log = logger.child({ chatId, function: 'getEarliestInvoiceDate' });

  try {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('telegramChatId', '==', chatId)
      .where('status', '==', 'processed')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      log.info('No invoices found for chat');
      return null;
    }

    const job = snapshot.docs[0].data() as InvoiceJob;
    const date = new Date(job.receivedAt);
    const formatted = formatDate(date);

    log.info({ earliestDate: formatted }, 'Found earliest invoice date');
    return formatted;
  } catch (error) {
    log.error({ error }, 'Failed to get earliest invoice date');
    throw error;
  }
}

/**
 * Query processed invoices for date range
 */
export async function getInvoicesForReport(
  chatId: number,
  dateRange: DateRange
): Promise<InvoiceForReport[]> {
  const db = getFirestore();
  const log = logger.child({ chatId, dateRange });

  log.info('Querying invoices for report');

  try {
    // Query invoice_jobs collection
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999); // End of day

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('telegramChatId', '==', chatId)
      .where('status', '==', 'processed')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .get();

    log.info({ count: snapshot.docs.length }, 'Found invoices');

    const invoices = snapshot.docs
      .map((doc) => {
        const job = doc.data() as InvoiceJob;

        // Only include if we have extraction data
        if (!job.vendorName || job.totalAmount === null || job.totalAmount === undefined) {
          return null;
        }

        const invoice: InvoiceForReport = {
          invoiceNumber: doc.id,
          date: job.invoiceDate || formatDate(new Date(job.receivedAt)),
          customerName: job.vendorName,
          amount: job.totalAmount,
          currency: job.currency || 'ILS',
          paymentMethod: 'Unknown', // Not stored in InvoiceJob currently
          category: job.category || undefined,
          driveLink: job.driveLink || '',
        };

        return invoice;
      })
      .filter((invoice): invoice is InvoiceForReport => invoice !== null);

    return invoices;
  } catch (error) {
    log.error({ error }, 'Failed to query invoices');
    throw error;
  }
}

/**
 * Calculate metrics from invoices (multi-currency aware)
 */
export function calculateMetrics(invoices: InvoiceForReport[]): ReportMetrics {
  if (invoices.length === 0) {
    return {
      totalRevenue: 0,
      invoiceCount: 0,
      avgInvoice: 0,
      maxInvoice: 0,
      minInvoice: 0,
      currencies: [],
      paymentMethods: {},
    };
  }

  // Group invoices by currency
  const byCurrency = new Map<string, InvoiceForReport[]>();
  invoices.forEach((inv) => {
    const currency = inv.currency || 'ILS';
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, []);
    }
    const currencyInvoices = byCurrency.get(currency);
    if (currencyInvoices) {
      currencyInvoices.push(inv);
    }
  });

  // Calculate metrics per currency
  const currencies = Array.from(byCurrency.entries())
    .map(([currency, currencyInvoices]) => {
      const amounts = currencyInvoices.map((inv) => inv.amount);
      const totalRevenue = amounts.reduce((sum, amount) => sum + amount, 0);

      return {
        currency,
        totalRevenue,
        invoiceCount: currencyInvoices.length,
        avgInvoice: totalRevenue / currencyInvoices.length,
        maxInvoice: Math.max(...amounts),
        minInvoice: Math.min(...amounts),
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue); // Sort by revenue descending

  // Use primary currency (highest revenue) for legacy fields
  const primaryCurrency = currencies[0];

  // Payment method breakdown (across all currencies)
  const paymentMethods: Record<string, { count: number; total: number }> = {};
  invoices.forEach((inv) => {
    const method = inv.paymentMethod;
    if (!paymentMethods[method]) {
      paymentMethods[method] = { count: 0, total: 0 };
    }
    paymentMethods[method].count++;
    paymentMethods[method].total += inv.amount;
  });

  return {
    // Legacy fields use primary currency
    totalRevenue: primaryCurrency.totalRevenue,
    invoiceCount: primaryCurrency.invoiceCount,
    avgInvoice: primaryCurrency.avgInvoice,
    maxInvoice: primaryCurrency.maxInvoice,
    minInvoice: primaryCurrency.minInvoice,
    // Multi-currency data
    currencies,
    paymentMethods,
  };
}

/**
 * Generate complete report data
 */
export async function generateReportData(
  chatId: number,
  dateRange: DateRange,
  businessName: string,
  reportType: 'revenue' | 'expenses' = 'revenue'
): Promise<ReportData> {
  const invoices = await getInvoicesForReport(chatId, dateRange);
  const metrics = calculateMetrics(invoices);

  return {
    businessName,
    reportType,
    dateRange,
    generatedAt: new Date().toISOString(),
    metrics,
    invoices,
  };
}
