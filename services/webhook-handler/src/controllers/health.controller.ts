/**
 * Health check controller
 */

import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

const VERSION = process.env.APP_VERSION || 'development';
const START_TIME = Date.now();

export function getHealth(_req: Request, res: Response): void {
  res.status(StatusCodes.OK).json({
    status: 'healthy',
    service: 'webhook-handler',
    version: VERSION,
    uptime: Math.floor((Date.now() - START_TIME) / 1000), // seconds
    timestamp: new Date().toISOString(),
  });
}
