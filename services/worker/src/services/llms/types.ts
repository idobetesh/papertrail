/**
 * Shared types for LLM providers
 */

import type { InvoiceExtraction, ExtractionResult } from '../../../../../shared/types';

export { InvoiceExtraction, ExtractionResult };

export interface LLMProvider {
  name: string;
  extractInvoiceData(imageBuffer: Buffer, fileExtension: string): Promise<ExtractionResult>;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public provider: string
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public provider: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
