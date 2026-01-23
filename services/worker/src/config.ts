/**
 * Configuration for worker service
 * Uses Zod for type-safe environment validation
 */

import { z } from 'zod';
import logger from './logger';

/**
 * Environment schema with validation and helpful error messages
 */
const envSchema = z.object({
  PORT: z.string().default('8080').transform(Number),
  GCP_PROJECT_ID: z.string().min(1, { message: 'GCP project ID is required' }),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, {
    message: 'Invalid Telegram bot token format. Get one from @BotFather on Telegram',
  }),
  OPENAI_API_KEY: z.string().startsWith('sk-', { message: 'OpenAI API key must start with sk-' }),
  GEMINI_API_KEY: z.string().optional(), // Optional - if not provided, only OpenAI is used
  STORAGE_BUCKET: z.string().min(3, { message: 'Cloud Storage bucket name is required' }),
  GENERATED_INVOICES_BUCKET: z.string().optional(), // Optional - for invoice generation feature
  ADMIN_SHEET_ID: z.string().min(10).optional(), // Optional - admin's sheet ID to include internal metrics
  MAX_RETRIES: z.string().default('6').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = {
  port: number;
  projectId: string;
  telegramBotToken: string;
  openaiApiKey: string;
  geminiApiKey: string | undefined;
  storageBucket: string;
  generatedInvoicesBucket: string;
  adminSheetId: string | undefined; // Optional - admin's sheet ID to include internal metrics
  maxRetries: number;
  isDevelopment: boolean;
};

let cachedConfig: Config | null = null;

/**
 * Load and validate configuration using Zod
 * Fails fast with clear error messages if required variables are missing
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'unknown',
      message: issue.message,
    }));

    logger.error(
      {
        errors,
        errorCount: result.error.issues.length,
      },
      'Configuration validation failed - check environment variables'
    );

    // Also log to console for immediate visibility during startup
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║                  CONFIGURATION ERROR                          ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');

    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'unknown';
      console.error(`║ ✗ ${path}: ${issue.message}`);
    }

    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║ Copy env.example to .env and fill in required values         ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');

    throw new Error(`Invalid configuration: ${result.error.issues.length} error(s)`);
  }

  const env = result.data;

  const config: Config = {
    port: env.PORT,
    projectId: env.GCP_PROJECT_ID,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    openaiApiKey: env.OPENAI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    storageBucket: env.STORAGE_BUCKET,
    generatedInvoicesBucket:
      env.GENERATED_INVOICES_BUCKET || `${env.GCP_PROJECT_ID}-generated-invoices`,
    adminSheetId: env.ADMIN_SHEET_ID,
    maxRetries: env.MAX_RETRIES,
    isDevelopment: env.NODE_ENV === 'development',
  };

  // Log loaded config (without sensitive values)
  logger.info(
    {
      port: config.port,
      project: config.projectId,
      telegramToken: maskSecret(config.telegramBotToken),
      openaiKey: maskSecret(config.openaiApiKey),
      geminiKey: config.geminiApiKey ? maskSecret(config.geminiApiKey) : 'not_configured',
      storageBucket: config.storageBucket,
      generatedInvoicesBucket: config.generatedInvoicesBucket,
      adminSheetId: config.adminSheetId || 'not_configured',
      maxRetries: config.maxRetries,
      isDevelopment: config.isDevelopment,
    },
    'Configuration loaded successfully'
  );

  cachedConfig = config;
  return config;
}

/**
 * Get cached configuration (must call loadConfig first)
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

/**
 * Mask a secret for logging (show first and last 4 chars)
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
