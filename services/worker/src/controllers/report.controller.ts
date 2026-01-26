/**
 * Report Controller
 * Handles incoming report command tasks from Cloud Tasks
 * Implements multi-step conversation flow: Type → Date → Format → Generate
 */

import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { ReportCommandPayload } from '../../../../shared/task.types';
import type { DatePreset } from '../../../../shared/report.types';
import * as userMappingService from '../services/customer/user-mapping.service';
import * as reportService from '../services/report/report.service';
import * as reportGeneratorService from '../services/report/report-generator.service';
import * as reportRateLimiterService from '../services/report/report-rate-limiter.service';
import * as reportSessionService from '../services/report/report-session.service';
import * as telegramService from '../services/telegram.service';
import * as businessConfigService from '../services/business-config/config.service';
import logger from '../logger';

/**
 * Handle /report command
 * Creates new session and starts conversation flow
 */
export async function handleReportCommand(req: Request, res: Response): Promise<void> {
  const payload = req.body as ReportCommandPayload;
  const log = logger.child({
    chatId: payload.chatId,
    userId: payload.userId,
    handler: 'handleReportCommand',
  });

  log.info('Processing /report command');

  try {
    // 1. Check user access
    const userCustomers = await userMappingService.getUserCustomers(payload.userId);
    const hasAccess = userCustomers.some((c) => c.chatId === payload.chatId);

    if (!hasAccess) {
      await telegramService.sendMessage(
        payload.chatId,
        "❌ אין לך הרשאה ליצור דוחות עבור צ'אט זה."
      );
      log.warn('User has no access to this chat');
      res.status(StatusCodes.FORBIDDEN).json({ error: 'No access' });
      return;
    }

    // 2. Cancel any existing active session
    const existingSession = await reportSessionService.getActiveSession(
      payload.chatId,
      payload.userId
    );
    if (existingSession) {
      await reportSessionService.cancelReportSession(existingSession.sessionId);
      log.info({ sessionId: existingSession.sessionId }, 'Cancelled existing session');
    }

    // 3. Create new session
    const session = await reportSessionService.createReportSession(payload.chatId, payload.userId);

    log.info({ sessionId: session.sessionId }, 'Created new report session');

    // 4. Send type selection message
    await sendTypeSelectionMessage(payload.chatId, session.sessionId);

    res.status(StatusCodes.OK).json({
      ok: true,
      action: 'session_created',
      sessionId: session.sessionId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error({ error: errorMessage, stack: errorStack }, 'Failed to start report flow');

    await telegramService.sendMessage(
      payload.chatId,
      '❌ שגיאה בהפעלת דוח\nאנא נסה שוב מאוחר יותר.'
    );

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to start report flow',
    });
  }
}

/**
 * Handle callback query from inline buttons
 */
export async function handleReportCallback(req: Request, res: Response): Promise<void> {
  const { callbackQueryId, chatId, userId, data } = req.body;
  const log = logger.child({ chatId, userId, handler: 'handleReportCallback' });

  try {
    // Parse callback data
    const callbackData = JSON.parse(data);
    const { action, sessionId, value } = callbackData;

    log.info({ action, sessionId, value }, 'Processing callback');

    // Get session
    const session = await reportSessionService.getActiveSession(chatId, userId);
    if (!session || session.sessionId !== sessionId) {
      await telegramService.answerCallbackQuery(callbackQueryId, {
        text: '⏱️ הפעלה פגה. אנא התחל מחדש עם /report',
        showAlert: true,
      });
      res.status(StatusCodes.OK).json({ ok: true, action: 'session_expired' });
      return;
    }

    // Route to appropriate handler
    switch (action) {
      case 'select_type':
        await handleTypeSelection(chatId, userId, sessionId, value, callbackQueryId);
        break;
      case 'select_date':
        await handleDateSelection(chatId, userId, sessionId, value, callbackQueryId);
        break;
      case 'select_format':
        await handleFormatSelection(chatId, userId, sessionId, value, callbackQueryId);
        break;
      case 'cancel':
        await reportSessionService.cancelReportSession(sessionId);
        await telegramService.answerCallbackQuery(callbackQueryId, {
          text: '❌ בוטל',
        });
        await telegramService.sendMessage(chatId, '❌ יצירת הדוח בוטלה');
        break;
      default:
        log.warn({ action }, 'Unknown callback action');
    }

    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error({ error: errorMessage, stack: errorStack }, 'Failed to handle callback');

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to handle callback',
    });
  }
}

/**
 * Send type selection message (Revenue or Expenses)
 */
async function sendTypeSelectionMessage(chatId: number, sessionId: string): Promise<void> {
  const message = '📊 איזה סוג דוח תרצה ליצור?';
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📈 הכנסות',
          callback_data: JSON.stringify({
            action: 'select_type',
            sessionId,
            value: 'revenue',
          }),
        },
        {
          text: '💸 הוצאות',
          callback_data: JSON.stringify({
            action: 'select_type',
            sessionId,
            value: 'expenses',
          }),
        },
      ],
      [
        {
          text: '❌ ביטול',
          callback_data: JSON.stringify({
            action: 'cancel',
            sessionId,
          }),
        },
      ],
    ],
  };

  await telegramService.sendMessage(chatId, message, {
    replyMarkup: keyboard,
  });
}

/**
 * Handle type selection (revenue or expenses)
 */
async function handleTypeSelection(
  chatId: number,
  userId: number,
  sessionId: string,
  reportType: 'revenue' | 'expenses',
  callbackQueryId: string
): Promise<void> {
  const log = logger.child({ chatId, userId, sessionId, reportType });

  try {
    // Update session
    await reportSessionService.updateReportSession(sessionId, {
      reportType,
      currentStep: 'date',
    });

    // Answer callback
    const typeName = reportType === 'revenue' ? 'הכנסות' : 'הוצאות';
    await telegramService.answerCallbackQuery(callbackQueryId, {
      text: `✅ נבחר: ${typeName}`,
    });

    // Send date selection message
    await sendDateSelectionMessage(chatId, sessionId);
  } catch (error) {
    log.error({ error }, 'Failed to handle type selection');
    throw error;
  }
}

/**
 * Send date range selection message
 */
async function sendDateSelectionMessage(chatId: number, sessionId: string): Promise<void> {
  const message = '📅 באיזו תקופה תרצה לראות את הדוח?';
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📆 החודש',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'this_month',
          }),
        },
        {
          text: '📆 חודש שעבר',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'last_month',
          }),
        },
      ],
      [
        {
          text: '📆 רבעון זה',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'this_quarter',
          }),
        },
        {
          text: '📆 רבעון שעבר',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'last_quarter',
          }),
        },
      ],
      [
        {
          text: '📆 שנה עד היום',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'ytd',
          }),
        },
        {
          text: '📆 שנה שעברה',
          callback_data: JSON.stringify({
            action: 'select_date',
            sessionId,
            value: 'last_year',
          }),
        },
      ],
      [
        {
          text: '❌ ביטול',
          callback_data: JSON.stringify({
            action: 'cancel',
            sessionId,
          }),
        },
      ],
    ],
  };

  await telegramService.sendMessage(chatId, message, {
    replyMarkup: keyboard,
  });
}

/**
 * Handle date selection
 */
async function handleDateSelection(
  chatId: number,
  userId: number,
  sessionId: string,
  datePreset: DatePreset,
  callbackQueryId: string
): Promise<void> {
  const log = logger.child({ chatId, userId, sessionId, datePreset });

  try {
    // Calculate date range
    const dateRange = reportService.getDateRangeForPreset(datePreset);

    // Get business config
    const businessConfig = await businessConfigService.getBusinessConfig(chatId);
    const businessName = businessConfig?.business?.name || 'העסק שלי';

    // Get session to check report type
    const session = await reportSessionService.getActiveSession(chatId, userId);
    if (!session || !session.reportType) {
      throw new Error('Session missing report type');
    }

    // Check if there are invoices FIRST - don't continue if empty!
    const reportData = await reportService.generateReportData(
      chatId,
      dateRange,
      businessName,
      session.reportType
    );

    if (reportData.invoices.length === 0) {
      const dateLabel = getDateLabel(datePreset);
      await telegramService.answerCallbackQuery(callbackQueryId, {
        text: '❌ אין חשבוניות בתקופה זו',
        showAlert: true,
      });
      await telegramService.sendMessage(
        chatId,
        `📊 אין חשבוניות לתקופה הנבחרת\n\n` +
          `תקופה: ${dateLabel}\n` +
          `תאריכים: ${dateRange.start} עד ${dateRange.end}\n\n` +
          `💡 העלה חשבוניות לצ'אט זה כדי שנוכל ליצור דוחות!\n\n` +
          `רוצה לנסות תקופה אחרת? שלח /report`
      );

      // Cancel session
      await reportSessionService.cancelReportSession(sessionId);
      return;
    }

    // Update session with date preset
    await reportSessionService.updateReportSession(sessionId, {
      datePreset,
      currentStep: 'format',
    });

    // Answer callback
    const dateLabel = getDateLabel(datePreset);
    await telegramService.answerCallbackQuery(callbackQueryId, {
      text: `✅ נבחר: ${dateLabel}`,
    });

    // Send format selection message
    await sendFormatSelectionMessage(chatId, sessionId, reportData.metrics.invoiceCount);
  } catch (error) {
    log.error({ error }, 'Failed to handle date selection');
    throw error;
  }
}

/**
 * Send format selection message (PDF, Excel, CSV)
 */
async function sendFormatSelectionMessage(
  chatId: number,
  sessionId: string,
  invoiceCount: number
): Promise<void> {
  const message = `✅ מצאנו ${invoiceCount} חשבוניות!\n\n📄 באיזה פורמט תרצה את הדוח?`;
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📄 PDF',
          callback_data: JSON.stringify({
            action: 'select_format',
            sessionId,
            value: 'pdf',
          }),
        },
        {
          text: '📊 Excel',
          callback_data: JSON.stringify({
            action: 'select_format',
            sessionId,
            value: 'excel',
          }),
        },
        {
          text: '📝 CSV',
          callback_data: JSON.stringify({
            action: 'select_format',
            sessionId,
            value: 'csv',
          }),
        },
      ],
      [
        {
          text: '❌ ביטול',
          callback_data: JSON.stringify({
            action: 'cancel',
            sessionId,
          }),
        },
      ],
    ],
  };

  await telegramService.sendMessage(chatId, message, {
    replyMarkup: keyboard,
  });
}

/**
 * Handle format selection and generate report
 */
async function handleFormatSelection(
  chatId: number,
  userId: number,
  sessionId: string,
  format: 'pdf' | 'excel' | 'csv',
  callbackQueryId: string
): Promise<void> {
  const log = logger.child({ chatId, userId, sessionId, format });

  try {
    // Get session
    const session = await reportSessionService.getActiveSession(chatId, userId);
    if (!session || !session.reportType || !session.datePreset) {
      throw new Error('Session missing required data');
    }

    // Update session
    await reportSessionService.updateReportSession(sessionId, {
      format,
      currentStep: 'generating',
    });

    // Answer callback
    const formatName = format === 'pdf' ? 'PDF' : format === 'excel' ? 'Excel' : 'CSV';
    await telegramService.answerCallbackQuery(callbackQueryId, {
      text: `✅ נבחר: ${formatName}`,
    });

    // Check rate limit
    const rateLimit = await reportRateLimiterService.checkReportLimit(chatId);
    if (!rateLimit.allowed) {
      const resetTime = rateLimit.resetAt?.toLocaleString('he-IL') || 'מחר';
      await telegramService.sendMessage(
        chatId,
        `⏸️ הגעת למכסת הדוחות היומית\n\n` +
          `דוח הבא יהיה זמין ב: ${resetTime}\n\n` +
          `💡 זה עוזר לנו לשמור על השירות חינמי ומהיר לכולם!`
      );

      // Cancel session
      await reportSessionService.cancelReportSession(sessionId);
      return;
    }

    // Send "generating" message
    await telegramService.sendMessage(chatId, '⏳ מייצר דוח...');

    // Get business config
    const businessConfig = await businessConfigService.getBusinessConfig(chatId);
    const businessName = businessConfig?.business?.name || 'העסק שלי';

    // Calculate date range
    const dateRange = reportService.getDateRangeForPreset(session.datePreset);

    // Generate report data
    const reportData = await reportService.generateReportData(
      chatId,
      dateRange,
      businessName,
      session.reportType
    );

    // Generate file based on format
    let fileBuffer: Buffer;
    let filename: string;

    if (format === 'pdf') {
      fileBuffer = await reportGeneratorService.generatePDFReport(reportData);
      filename = `report_${session.reportType}_${dateRange.start}_${dateRange.end}.pdf`;
    } else if (format === 'excel') {
      fileBuffer = await reportGeneratorService.generateExcelReport(reportData);
      filename = `report_${session.reportType}_${dateRange.start}_${dateRange.end}.xlsx`;
    } else {
      fileBuffer = await reportGeneratorService.generateCSVReport(reportData);
      filename = `report_${session.reportType}_${dateRange.start}_${dateRange.end}.csv`;
    }

    // Generate caption
    const reportTypeName = session.reportType === 'revenue' ? 'הכנסות' : 'הוצאות';
    const dateLabel = getDateLabel(session.datePreset);
    const caption =
      `✅ דוח ${reportTypeName} נוצר!\n\n` +
      `📊 תקופה: ${dateLabel}\n` +
      `📅 תאריכים: ${dateRange.start} עד ${dateRange.end}\n` +
      `💰 סה"כ: ₪${reportData.metrics.totalRevenue.toLocaleString('he-IL')}\n` +
      `📄 חשבוניות: ${reportData.metrics.invoiceCount}\n` +
      `📈 ממוצע: ₪${Math.round(reportData.metrics.avgInvoice).toLocaleString('he-IL')}\n\n` +
      `רוצה עוד דוח? שלח /report`;

    // Send document
    await telegramService.sendDocument(chatId, fileBuffer, filename, {
      caption,
      parseMode: 'Markdown',
    });

    // Record rate limit
    await reportRateLimiterService.recordReportGeneration(chatId);

    // Complete session
    await reportSessionService.completeReportSession(sessionId);

    log.info(
      {
        reportType: session.reportType,
        datePreset: session.datePreset,
        format,
        invoiceCount: reportData.metrics.invoiceCount,
        totalRevenue: reportData.metrics.totalRevenue,
      },
      'Report generated successfully'
    );
  } catch (error) {
    log.error({ error }, 'Failed to generate report');

    await telegramService.sendMessage(chatId, '❌ שגיאה ביצירת הדוח\nאנא נסה שוב מאוחר יותר.');

    // Cancel session on error
    await reportSessionService.cancelReportSession(sessionId);
    throw error;
  }
}

/**
 * Get Hebrew label for date preset
 */
function getDateLabel(preset: DatePreset): string {
  const labels: Record<DatePreset, string> = {
    this_month: 'החודש',
    last_month: 'חודש שעבר',
    this_quarter: 'רבעון זה',
    last_quarter: 'רבעון שעבר',
    ytd: 'שנה עד היום',
    this_year: 'שנה זו',
    last_year: 'שנה שעברה',
    custom: 'מותאם אישית',
  };
  return labels[preset] || preset;
}
