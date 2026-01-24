import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';

const BASE_PATH = '/customers';

export function createCustomerRoutes(customerController: CustomerController): Router {
  const router = Router();

  router.get(BASE_PATH, customerController.listCustomers);
  router.get(`${BASE_PATH}/:chatId/offboarding-preview`, customerController.getOffboardingPreview);
  router.delete(`${BASE_PATH}/:chatId/offboard`, customerController.offboardCustomer);

  return router;
}
