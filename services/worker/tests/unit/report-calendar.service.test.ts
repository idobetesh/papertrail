/**
 * Unit tests for Report Calendar Service
 */

// Mock report.service before importing calendar service
jest.mock('../../src/services/report/report.service');

import * as reportCalendarService from '../../src/services/report/report-calendar.service';
import * as reportService from '../../src/services/report/report.service';

describe('Report Calendar Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCalendarLimits', () => {
    it('should return limits based on earliest invoice date', async () => {
      // Mock user has invoices starting from 2025-06-01
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue('2025-06-01');

      const result = await reportCalendarService.getCalendarLimits(-1001234567);

      expect(result.earliestInvoiceDate).toBe('2025-06-01');
      expect(result.minDate).toEqual(new Date('2025-06-01'));
      expect(result.maxDate.getDate()).toBe(new Date().getDate()); // Today
    });

    it('should return today as min when user has no invoices', async () => {
      // Mock user has no invoices
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue(null);

      const result = await reportCalendarService.getCalendarLimits(-1001234567);

      expect(result.earliestInvoiceDate).toBeNull();
      expect(result.minDate.getDate()).toBe(new Date().getDate()); // Today
      expect(result.maxDate.getDate()).toBe(new Date().getDate()); // Today
    });

    it('should set maxDate to end of today', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue('2025-01-01');

      const result = await reportCalendarService.getCalendarLimits(-1001234567);

      expect(result.maxDate.getHours()).toBe(23);
      expect(result.maxDate.getMinutes()).toBe(59);
      expect(result.maxDate.getSeconds()).toBe(59);
      expect(result.maxDate.getMilliseconds()).toBe(999);
    });

    it('should call getEarliestInvoiceDate with correct chatId', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue('2025-01-01');

      await reportCalendarService.getCalendarLimits(-1001234567);

      expect(reportService.getEarliestInvoiceDate).toHaveBeenCalledWith(-1001234567);
      expect(reportService.getEarliestInvoiceDate).toHaveBeenCalledTimes(1);
    });

    it('should throw error when getEarliestInvoiceDate fails', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockRejectedValue(
        new Error('Firestore error')
      );

      await expect(reportCalendarService.getCalendarLimits(-1001234567)).rejects.toThrow(
        'Firestore error'
      );
    });
  });

  describe('formatDateForDisplay', () => {
    it('should format date in Hebrew', () => {
      const date = new Date('2025-06-15');
      const result = reportCalendarService.formatDateForDisplay(date, 'he');

      // Hebrew date should contain year and month
      expect(result).toContain('2025');
      expect(result).toContain('15');
    });

    it('should format date in English', () => {
      const date = new Date('2025-06-15');
      const result = reportCalendarService.formatDateForDisplay(date, 'en');

      expect(result).toContain('2025');
      expect(result).toContain('15');
      expect(result).toContain('June'); // Month name in English
    });

    it('should format date string in Hebrew', () => {
      const dateStr = '2025-12-25';
      const result = reportCalendarService.formatDateForDisplay(dateStr, 'he');

      expect(result).toContain('2025');
      expect(result).toContain('25');
    });

    it('should default to Hebrew when language not specified', () => {
      const date = new Date('2025-01-01');
      const result = reportCalendarService.formatDateForDisplay(date);

      // Should be in Hebrew format
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('getDateSelectionMessage', () => {
    it('should return Hebrew message for start date with earliest date', () => {
      const result = reportCalendarService.getDateSelectionMessage('start', '2025-06-01', 'he');

      expect(result).toContain('בחר תאריך התחלה');
      expect(result).toContain('תאריך ראשון זמין');
      expect(result).toContain('2025');
    });

    it('should return Hebrew message for start date without earliest date', () => {
      const result = reportCalendarService.getDateSelectionMessage('start', null, 'he');

      expect(result).toContain('בחר תאריך התחלה');
      expect(result).not.toContain('תאריך ראשון זמין');
    });

    it('should return Hebrew message for end date', () => {
      const result = reportCalendarService.getDateSelectionMessage('end', null, 'he');

      expect(result).toContain('בחר תאריך סיום');
      expect(result).not.toContain('תאריך ראשון זמין');
    });

    it('should return English message for start date with earliest date', () => {
      const result = reportCalendarService.getDateSelectionMessage('start', '2025-06-01', 'en');

      expect(result).toContain('Select report start date');
      expect(result).toContain('Earliest available');
      expect(result).toContain('2025');
    });

    it('should return English message for end date', () => {
      const result = reportCalendarService.getDateSelectionMessage('end', null, 'en');

      expect(result).toContain('Select report end date');
      expect(result).not.toContain('Earliest available');
    });

    it('should default to Hebrew when language not specified', () => {
      const result = reportCalendarService.getDateSelectionMessage('start', null);

      expect(result).toContain('בחר'); // Hebrew word for "select"
    });
  });

  describe('getNoInvoicesMessage', () => {
    it('should return Hebrew message', () => {
      const result = reportCalendarService.getNoInvoicesMessage('he');

      expect(result).toContain('לא נמצאו חשבוניות');
      expect(result).toContain('שלח');
    });

    it('should return English message', () => {
      const result = reportCalendarService.getNoInvoicesMessage('en');

      expect(result).toContain('No invoices found');
      expect(result).toContain('Send');
    });

    it('should default to Hebrew', () => {
      const result = reportCalendarService.getNoInvoicesMessage();

      expect(result).toContain('לא נמצאו חשבוניות');
    });

    it('should include actionable guidance', () => {
      const hebrewMsg = reportCalendarService.getNoInvoicesMessage('he');
      const englishMsg = reportCalendarService.getNoInvoicesMessage('en');

      // Should tell user to send invoices
      expect(hebrewMsg).toContain('שלח');
      expect(englishMsg).toContain('Send');
    });
  });

  describe('getBeforeFirstInvoiceMessage', () => {
    it('should return Hebrew message with formatted date', () => {
      const result = reportCalendarService.getBeforeFirstInvoiceMessage('2025-06-01', 'he');

      expect(result).toContain('התאריך שנבחר מוקדם מדי');
      expect(result).toContain('2025');
    });

    it('should return English message with formatted date', () => {
      const result = reportCalendarService.getBeforeFirstInvoiceMessage('2025-06-01', 'en');

      expect(result).toContain('Selected date is too early');
      expect(result).toContain('2025');
      expect(result).toContain('June'); // Month name in English
    });

    it('should default to Hebrew', () => {
      const result = reportCalendarService.getBeforeFirstInvoiceMessage('2025-06-01');

      expect(result).toContain('התאריך שנבחר מוקדם מדי');
    });

    it('should include the earliest invoice date in message', () => {
      const hebrewMsg = reportCalendarService.getBeforeFirstInvoiceMessage('2025-12-25', 'he');
      const englishMsg = reportCalendarService.getBeforeFirstInvoiceMessage('2025-12-25', 'en');

      expect(hebrewMsg).toContain('2025');
      expect(hebrewMsg).toContain('25');
      expect(englishMsg).toContain('2025');
      expect(englishMsg).toContain('25');
      expect(englishMsg).toContain('December');
    });
  });

  describe('Integration scenarios', () => {
    it('should provide complete flow for user with invoices', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue('2025-06-01');

      // 1. Get calendar limits
      const limits = await reportCalendarService.getCalendarLimits(-1001234567);
      expect(limits.earliestInvoiceDate).toBe('2025-06-01');

      // 2. Show start date message
      const startMsg = reportCalendarService.getDateSelectionMessage(
        'start',
        limits.earliestInvoiceDate,
        'he'
      );
      expect(startMsg).toContain('בחר תאריך התחלה');
      expect(startMsg).toContain('1 ביוני 2025'); // Hebrew formatted date

      // 3. User picks date before first invoice - show error
      const errorMsg = reportCalendarService.getBeforeFirstInvoiceMessage('2025-06-01', 'he');
      expect(errorMsg).toContain('מוקדם מדי');
    });

    it('should provide complete flow for user without invoices', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue(null);

      // 1. Get calendar limits
      const limits = await reportCalendarService.getCalendarLimits(-1001234567);
      expect(limits.earliestInvoiceDate).toBeNull();

      // 2. Show no invoices message
      const noInvoicesMsg = reportCalendarService.getNoInvoicesMessage('he');
      expect(noInvoicesMsg).toContain('לא נמצאו חשבוניות');
    });

    it('should handle date formatting consistently across functions', () => {
      const testDate = '2025-06-15';

      const formatted = reportCalendarService.formatDateForDisplay(testDate, 'he');
      const message = reportCalendarService.getBeforeFirstInvoiceMessage(testDate, 'he');

      // Both should include the year
      expect(formatted).toContain('2025');
      expect(message).toContain('2025');
    });
  });

  describe('Edge cases', () => {
    it('should handle very old earliest invoice date', async () => {
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue('2020-01-01');

      const result = await reportCalendarService.getCalendarLimits(-1001234567);

      expect(result.minDate).toEqual(new Date('2020-01-01'));
      expect(result.earliestInvoiceDate).toBe('2020-01-01');
    });

    it('should handle today as earliest invoice date', async () => {
      const today = new Date().toISOString().split('T')[0];
      (reportService.getEarliestInvoiceDate as jest.Mock).mockResolvedValue(today);

      const result = await reportCalendarService.getCalendarLimits(-1001234567);

      expect(result.earliestInvoiceDate).toBe(today);
      expect(result.minDate.toISOString().split('T')[0]).toBe(today);
    });

    it('should handle date at year boundary', () => {
      const result = reportCalendarService.formatDateForDisplay('2025-12-31', 'he');

      expect(result).toContain('2025');
      expect(result).toContain('31');
    });

    it('should handle leap year date', () => {
      const result = reportCalendarService.formatDateForDisplay('2024-02-29', 'en');

      expect(result).toContain('2024');
      expect(result).toContain('29');
      expect(result).toContain('February');
    });
  });
});
