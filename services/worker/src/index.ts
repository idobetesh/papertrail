/**
 * Worker Service - Entry Point
 */

import app from './app';
import { loadConfig } from './config';
import logger from './logger';

// Graceful shutdown
function shutdown(): void {
  logger.info('Shutting down...');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function main(): Promise<void> {
  try {
    const config = loadConfig();

    logger.info(
      {
        port: config.port,
        project: config.projectId,
        storageBucket: config.storageBucket,
        sheetId: config.sheetId,
      },
      'Configuration loaded'
    );

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Worker service started');
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
