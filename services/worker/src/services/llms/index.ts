/**
 * LLM Service - Hybrid provider with fallback
 * 
 * Strategy:
 * 1. Try Gemini (free tier)
 * 2. If 429 rate limit → immediately fallback to OpenAI (no retry)
 * 3. Other errors → throw (Cloud Tasks will retry)
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

  // Try Gemini first (free tier)
  try {
    logger.debug('Attempting Gemini extraction');
    const result = await gemini.extractInvoiceData(imageBuffer, fileExtension);
    return result;
  } catch (error) {
    // Rate limit → immediate fallback, no retry
    if (error instanceof RateLimitError) {
      logger.warn(
        { provider: error.provider },
        'Rate limit hit, falling back to OpenAI (no retry on 429)'
      );
      return openai.extractInvoiceData(imageBuffer, fileExtension);
    }

    // Auth error → fall back to OpenAI
    if (error instanceof AuthError) {
      logger.error(
        { provider: error.provider },
        'Auth error, falling back to OpenAI'
      );
      return openai.extractInvoiceData(imageBuffer, fileExtension);
    }

    // Other Gemini errors → try OpenAI as fallback
    logger.warn(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Gemini failed, falling back to OpenAI'
    );
    return openai.extractInvoiceData(imageBuffer, fileExtension);
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
