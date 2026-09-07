import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createPlayerProfileZodSchema,
  updatePlayerProfileZodSchema,
  updatePlayerAttributesZodSchema,
  createMatchRecordZodSchema,
} from './player.validation';
import {
  createPlayerProfile,
  getPlayerProfile,
  getAllPlayerProfiles,
  updatePlayerProfile,
  updatePlayerAttributes,
  getPlayerAttributes,
  addMatchRecord,
  getMatchRecords,
} from './player.controller';

const router = Router();

router.post('/', auth(), validateRequest(createPlayerProfileZodSchema), createPlayerProfile);
router.get('/', getAllPlayerProfiles);
router.get('/:id', getPlayerProfile);
router.patch('/:id', auth(), validateRequest(updatePlayerProfileZodSchema), updatePlayerProfile);

router.get('/:playerId/attributes', getPlayerAttributes);
router.patch(
  '/:playerId/attributes',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  validateRequest(updatePlayerAttributesZodSchema),
  updatePlayerAttributes,
);

router.post(
  '/:playerId/matches',
  auth('SUPER_ADMIN', 'COACH', 'PLAYER'),
  validateRequest(createMatchRecordZodSchema),
  addMatchRecord,
);
router.get('/:playerId/matches', getMatchRecords);

export const PlayerRoutes = router;
