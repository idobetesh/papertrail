/**
 * Webhook controller - handles Telegram webhook requests
 */

import { Request, Response } from 'express';
import { getConfig } from '../config';
import * as telegramService from '../services/telegram.service';
import * as tasksService from '../services/tasks.service';
import logger from '../logger';

/**
 * Handle incoming Telegram webhook updates
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const config = getConfig();
  const { secretPath } = req.params;

  // Validate secret path
  if (secretPath !== config.webhookSecretPath) {
    logger.warn('Invalid webhook secret path received');
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Validate and parse update with Zod
  const update = telegramService.parseUpdate(req.body);
  if (!update) {
    logger.warn({ body: req.body }, 'Invalid Telegram update received');
    res.status(400).json({ error: 'Invalid update' });
    return;
  }

  logger.info({ updateId: update.update_id }, 'Received Telegram update');

  // Ignore commands for now (could add /status, /help later)
  if (telegramService.isCommand(update)) {
    logger.debug('Ignoring command message');
    res.status(200).json({ ok: true, action: 'ignored_command' });
    return;
  }

  // Only process photo messages
  if (!telegramService.isPhotoMessage(update)) {
    logger.debug('Ignoring non-photo message');
    res.status(200).json({ ok: true, action: 'ignored_non_photo' });
    return;
  }

  // Extract payload for worker
  const payload = telegramService.extractTaskPayload(update);
  if (!payload) {
    logger.error('Failed to extract payload from photo message');
    res.status(400).json({ error: 'Failed to extract payload' });
    return;
  }

  logger.info(
    { chatId: payload.chatId, messageId: payload.messageId, uploader: payload.uploaderUsername },
    'Processing photo message'
  );

  try {
    const taskName = await tasksService.enqueueProcessingTask(payload, config);
    logger.info({ taskName }, 'Task enqueued successfully');

    res.status(200).json({
      ok: true,
      action: 'enqueued',
      task: taskName,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to enqueue task');
    res.status(500).json({ error: 'Failed to enqueue task' });
  }
}
