/**
 * Trace context middleware - Extract GCP Cloud Trace ID and add to request
 *
 * Cloud Run automatically adds X-Cloud-Trace-Context header:
 * Format: "TRACE_ID/SPAN_ID;o=TRACE_TRUE"
 *
 * This middleware:
 * 1. Extracts the trace ID from the header
 * 2. Attaches it to req object for use in controllers
 * 3. Adds it to the logger context for all subsequent logs
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

// Extend Express Request type to include trace info
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      log: typeof logger;
    }
  }
}

/**
 * Extract trace ID from X-Cloud-Trace-Context header
 * Header format: "TRACE_ID/SPAN_ID;o=TRACE_TRUE"
 * Returns just the TRACE_ID part
 */
function extractTraceId(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const parts = header.split('/');
  return parts[0] || undefined;
}

/**
 * Middleware to extract and attach trace context to requests
 */
export function traceContext(req: Request, res: Response, next: NextFunction): void {
  // Extract trace ID from GCP Cloud Trace header
  const traceHeader = req.headers['x-cloud-trace-context'] as string | undefined;
  const traceId = extractTraceId(traceHeader);

  // Attach trace ID to request
  if (traceId) {
    req.traceId = traceId;
  }

  // Create a child logger with trace context for this request
  req.log = traceId ? logger.child({ traceId }) : logger;

  next();
}
