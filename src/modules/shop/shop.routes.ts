import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createProductZodSchema,
  updateProductZodSchema,
  createOrderZodSchema,
} from './shop.validation';
import {
  createProduct,
  getAllProducts,
  getProduct,
  getProductCategories,
  updateProduct,
  deleteProduct,
  createOrder,
  getUserOrders,
} from './shop.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// Category distinct list
router.get('/products/categories', getProductCategories);
router.get('/categories', getProductCategories);

// Product CRUD
router.post(
  '/products',
  auth('SUPER_ADMIN', 'ACADEMY'),
  upload.any() as any,
  validateRequest(createProductZodSchema),
  createProduct,
);
router.post(
  '/',
  auth('SUPER_ADMIN', 'ACADEMY'),
  upload.any() as any,
  validateRequest(createProductZodSchema),
  createProduct,
);

router.get('/products', getAllProducts);
router.get('/', getAllProducts);

router.get('/products/:slug', getProduct);
router.get('/:slug', getProduct);

router.patch(
  '/products/:slug',
  auth('SUPER_ADMIN', 'ACADEMY'),
  upload.any() as any,
  validateRequest(updateProductZodSchema),
  updateProduct,
);
router.patch(
  '/:slug',
  auth('SUPER_ADMIN', 'ACADEMY'),
  upload.any() as any,
  validateRequest(updateProductZodSchema),
  updateProduct,
);

router.delete('/products/:slug', auth('SUPER_ADMIN', 'ACADEMY'), deleteProduct);
router.delete('/:slug', auth('SUPER_ADMIN', 'ACADEMY'), deleteProduct);

// Orders
router.post('/orders', auth(), validateRequest(createOrderZodSchema), createOrder);
router.get('/orders', auth(), getUserOrders);

export const ShopRoutes = router;
