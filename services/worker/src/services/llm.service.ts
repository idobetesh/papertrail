/**
 * LLM Service - Re-exports from llms module
 * 
 * This file provides backward compatibility.
 * The actual implementation is in ./llms/
 */

export { extractInvoiceData, needsReview } from './llms';
export type { ExtractionResult, InvoiceExtraction } from './llms';
