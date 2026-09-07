import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createPlanZodSchema, subscribeZodSchema } from './subscription.validation';
import { createPlan, getPlans, subscribe, getUserSubscription } from './subscription.controller';

const router = Router();

router.post('/plans', auth('SUPER_ADMIN'), validateRequest(createPlanZodSchema), createPlan);
router.get('/plans', getPlans);

router.post('/subscribe', auth(), validateRequest(subscribeZodSchema), subscribe);
router.get('/my-subscription', auth(), getUserSubscription);

export const SubscriptionRoutes = router;
