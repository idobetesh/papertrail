/**
 * Health check controller
 */

import { Request, Response } from 'express';

const VERSION = process.env.APP_VERSION || 'development';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'healthy',
    version: VERSION,
  });
}
