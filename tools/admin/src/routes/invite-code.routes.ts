import { Router } from 'express';
import { InviteCodeController } from '../controllers/invite-code.controller';

const BASE_PATH = '/invite-codes';

export function createInviteCodeRoutes(inviteCodeController: InviteCodeController): Router {
  const router = Router();

  router.post(BASE_PATH, inviteCodeController.createInviteCode);
  router.get(BASE_PATH, inviteCodeController.listInviteCodes);
  router.get(`${BASE_PATH}/:code`, inviteCodeController.getInviteCode);
  router.get(`${BASE_PATH}/:code/onboarding-status`, inviteCodeController.getOnboardingStatus);
  router.post(`${BASE_PATH}/:code/cleanup-session`, inviteCodeController.cleanupSession);
  router.post(`${BASE_PATH}/:code/delete-all`, inviteCodeController.deleteAll);
  router.post(`${BASE_PATH}/:code/revoke`, inviteCodeController.revokeInviteCode);
  router.delete(`${BASE_PATH}/:code`, inviteCodeController.deleteInviteCode);

  return router;
}
