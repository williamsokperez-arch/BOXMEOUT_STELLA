import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { referralsController } from '../controllers/referrals.controller.js';

const router = Router();

// GET /api/referrals/code — returns authenticated user's referral code and link
router.get('/code', requireAuth, (req, res) =>
  referralsController.getCode(req, res)
);

// GET /api/referrals — returns list of referred users with status and rewards
router.get('/', requireAuth, (req, res) =>
  referralsController.getInfo(req, res)
);

// POST /api/referrals/claim — claim signup via referral code
router.post('/claim', requireAuth, (req, res) =>
  referralsController.claim(req, res)
);

export default router;
