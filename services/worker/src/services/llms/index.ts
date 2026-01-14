/**
 * LLM Service - Hybrid provider with fallback
 * 
 * Strategy:
 * 1. Try Gemini (free tier)
 * 2. On any error → fallback to OpenAI (paid, reliable)
 */

import type { ExtractionResult, InvoiceExtraction } from './types';
import { RateLimitError, AuthError } from './types';
import * as gemini from './gemini';
import * as openai from './openai';
import { getConfig } from '../../config';
import logger from '../../logger';

export { RateLimitError, AuthError } from './types';
export type { ExtractionResult, InvoiceExtraction };

/**
 * Extract invoice data using hybrid LLM strategy
 * - Primary: Gemini (free)
 * - Fallback: OpenAI (paid, reliable)
 */
export async function extractInvoiceData(
  imageBuffer: Buffer,
  fileExtension: string
): Promise<ExtractionResult> {
  const config = getConfig();

  // If no Gemini key configured, use OpenAI directly
  if (!config.geminiApiKey) {
    logger.debug('No Gemini API key, using OpenAI directly');
    return openai.extractInvoiceData(imageBuffer, fileExtension);
  }

  // Try Gemini first (free tier), fall back to OpenAI on any error
  try {
    logger.debug('Attempting Gemini extraction');
    return await gemini.extractInvoiceData(imageBuffer, fileExtension);
  } catch (error) {
    const errorInfo = error instanceof RateLimitError || error instanceof AuthError
      ? { provider: error.provider, type: error.constructor.name }
      : { error: error instanceof Error ? error.message : 'Unknown error' };

    logger.warn(errorInfo, 'Gemini failed, falling back to OpenAI');
    return openai.extractInvoiceData(imageBuffer, fileExtension);
  }
}

/**
 * Extract invoice data from multiple images (for multi-page PDFs)
 * Uses hybrid LLM strategy with fallback
 * - Primary: Gemini (free)
 * - Fallback: OpenAI (paid, reliable)
 */
export async function extractInvoiceDataMulti(
  imageBuffers: Buffer[],
  fileExtension: string
): Promise<ExtractionResult> {
  const config = getConfig();

  // If no Gemini key configured, use OpenAI directly
  if (!config.geminiApiKey) {
    logger.debug('No Gemini API key, using OpenAI directly');
    return openai.extractInvoiceDataMulti(imageBuffers, fileExtension);
  }

  // Try Gemini first (free tier), fall back to OpenAI on any error
  try {
    logger.debug('Attempting Gemini multi-image extraction');
    return await gemini.extractInvoiceDataMulti(imageBuffers, fileExtension);
  } catch (error) {
    const errorInfo = error instanceof RateLimitError || error instanceof AuthError
      ? { provider: error.provider, type: error.constructor.name }
      : { error: error instanceof Error ? error.message : 'Unknown error' };

    logger.warn(errorInfo, 'Gemini failed, falling back to OpenAI');
    return openai.extractInvoiceDataMulti(imageBuffers, fileExtension);
  }
}

/**
 * Determine if extraction needs review based on confidence and missing fields
 */
export function needsReview(extraction: InvoiceExtraction): boolean {
  // Low confidence
  if (extraction.confidence < 0.6) {
    return true;
  }

  // Missing critical fields
  if (!extraction.total_amount) {
    return true;
  }

  return false;
}
