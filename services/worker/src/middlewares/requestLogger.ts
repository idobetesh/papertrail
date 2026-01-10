/**
 * HTTP request logging middleware using morgan
 */

import morgan from 'morgan';
import logger from '../logger';

export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }
);
