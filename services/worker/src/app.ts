/**
 * Express application setup
 */

import express from 'express';
import routes from './routes';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// Body parsing
app.use(express.json());

// Request logging
app.use(requestLogger);

// Routes
app.use(routes);

// Error handling (must be last)
app.use(errorHandler);

export default app;
