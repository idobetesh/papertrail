import { Request, Response, NextFunction } from 'express';

/**
 * Optional password protection middleware
 * Set ADMIN_PASSWORD environment variable to enable
 */
export function requireAuth(adminPassword?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminPassword) {
      return next(); // No password set, allow access
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return res.status(401).json({ error: 'Unauthorized. Set ADMIN_PASSWORD env var.' });
    }

    next();
  };
}
