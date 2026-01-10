/**
 * Application routes
 */

import { Router } from 'express';
import * as healthController from '../controllers/health.controller';
import * as webhookController from '../controllers/webhook.controller';

const router = Router();

// Health check (includes version)
router.get('/health', healthController.getHealth);

// Telegram webhook
router.post('/webhook/:secretPath', webhookController.handleWebhook);

export default router;
