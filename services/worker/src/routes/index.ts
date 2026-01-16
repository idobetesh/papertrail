/**
 * Application routes
 */

import { Router } from 'express';
import { validateCloudTasks } from '../middlewares/cloudTasks';
import * as healthController from '../controllers/health.controller';
import * as processController from '../controllers/process.controller';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();

// Health check (includes version)
router.get('/health', healthController.getHealth);

// Metrics endpoint for monitoring dashboard
router.get('/metrics', healthController.getMetrics);

// Invoice processing (Cloud Tasks validated)
router.post('/process', validateCloudTasks, processController.processInvoice);

// Callback query handling (from webhook-handler)
router.post('/callback', processController.handleCallback);

// Manual failure notification (for testing)
router.post('/notify-failure', processController.notifyFailure);

// Invoice generation endpoints
router.post('/invoice/command', invoiceController.handleInvoiceCommand);
router.post('/invoice/message', invoiceController.handleInvoiceMessage);
router.post('/invoice/callback', invoiceController.handleInvoiceCallback);

export default router;
