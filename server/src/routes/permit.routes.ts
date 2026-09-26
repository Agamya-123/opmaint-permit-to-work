import { Router } from 'express';
import {
  createPermit,
  updatePermit,
  getPermits,
  getPermit,
  performAction,
  logWork,
  getReadiness,
} from '../controllers/permit.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', createPermit);
router.get('/', getPermits);
router.get('/:id', getPermit);
router.put('/:id', updatePermit);
router.post('/:id/action', performAction);
router.post('/:id/work-logs', logWork);
router.get('/:id/readiness', getReadiness);

export default router;
