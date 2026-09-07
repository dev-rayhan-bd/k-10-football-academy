import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createProductZodSchema, createOrderZodSchema } from './shop.validation';
import {
  createProduct,
  getAllProducts,
  getProduct,
  createOrder,
  getUserOrders,
} from './shop.controller';

const router = Router();

router.post(
  '/products',
  auth('SUPER_ADMIN', 'ACADEMY'),
  validateRequest(createProductZodSchema),
  createProduct,
);
router.get('/products', getAllProducts);
router.get('/products/:id', getProduct);

router.post('/orders', auth(), validateRequest(createOrderZodSchema), createOrder);
router.get('/orders', auth(), getUserOrders);

export const ShopRoutes = router;
