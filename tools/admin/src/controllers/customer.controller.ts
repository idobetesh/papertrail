import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { CustomerService } from '../services/customer.service';
import { OffboardingService } from '../offboarding/offboarding.service';

export class CustomerController {
  constructor(
    private customerService: CustomerService,
    private offboardingService?: OffboardingService
  ) {}

  /**
   * List all customers
   */
  listCustomers = async (req: Request, res: Response): Promise<void> => {
    try {
      const customers = await this.customerService.listCustomers();
      res.json({ customers });
    } catch (error) {
      console.error('Error listing customers:', error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: `Failed to list customers: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  /**
   * Get offboarding preview for a customer
   * Uses new comprehensive offboarding service if available, falls back to old service
   */
  getOffboardingPreview = async (req: Request, res: Response): Promise<void> => {
    try {
      const chatId = parseInt(req.params.chatId, 10);

      if (isNaN(chatId)) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid chat ID' });
        return;
      }

      if (this.offboardingService) {
        // Use new comprehensive service
        const preview = await this.offboardingService.previewBusinessOffboarding(chatId);
        res.json(preview);
      } else {
        // Fallback to old service (backward compatibility)
        const preview = await this.customerService.getOffboardingPreview(chatId);
        res.json(preview);
      }
    } catch (error) {
      console.error('Error getting offboarding preview:', error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: `Failed to get offboarding preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  /**
   * Offboard a customer (delete all their data)
   * Uses new comprehensive offboarding service if available, falls back to old service
   */
  offboardCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const chatId = parseInt(req.params.chatId, 10);

      if (isNaN(chatId)) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid chat ID' });
        return;
      }

      if (this.offboardingService) {
        // Use new comprehensive service
        const report = await this.offboardingService.offboardBusiness(chatId);
        res.json({
          success: true,
          chatId,
          deleted: report.firestoreDocs + report.storageFiles,
          report,
          message: `Customer ${chatId} has been completely removed from the system`,
        });
      } else {
        // Fallback to old service (backward compatibility)
        const result = await this.customerService.offboardCustomer(chatId);
        res.json({
          success: true,
          chatId,
          deleted: result.deleted,
          message: `Customer ${chatId} has been completely removed from the system`,
        });
      }
    } catch (error) {
      console.error('Error offboarding customer:', error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: `Failed to offboard customer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };
}
