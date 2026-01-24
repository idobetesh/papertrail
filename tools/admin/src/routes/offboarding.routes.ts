import { Router } from 'express';
import { OffboardingController } from '../offboarding/offboarding.controller';

const BUSINESS_BASE_PATH = '/offboard/business';
const USER_BASE_PATH = '/offboard/user';

export function createOffboardingRoutes(offboardingController: OffboardingController): Router {
  const router = Router();

  // Business offboarding
  router.get(
    `${BUSINESS_BASE_PATH}/:chatId/preview`,
    offboardingController.previewBusinessOffboarding
  );
  router.delete(`${BUSINESS_BASE_PATH}/:chatId`, offboardingController.offboardBusiness);

  // User offboarding (GDPR)
  router.get(`${USER_BASE_PATH}/:userId/preview`, offboardingController.previewUserOffboarding);
  router.delete(`${USER_BASE_PATH}/:userId`, offboardingController.offboardUser);

  return router;
}
