import { Router } from 'express';
import {
  getPlants,
  createPlant,
  getAreas,
  createArea,
  assignAreaOwner,
  getEquipment,
  createEquipment,
  getUsers,
} from '../controllers/masterData.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticateToken);

// Plants
router.get('/plants', getPlants);
router.post('/plants', requireRole(UserRole.ADMIN), createPlant);

// Areas
router.get('/areas', getAreas);
router.post('/areas', requireRole(UserRole.ADMIN), createArea);
router.post('/areas/:id/owners', requireRole(UserRole.ADMIN), assignAreaOwner);

// Equipment
router.get('/equipment', getEquipment);
router.post('/equipment', requireRole(UserRole.ADMIN, UserRole.AREA_OWNER), createEquipment);

// Users
router.get('/users', requireRole(UserRole.ADMIN), getUsers);

export default router;
