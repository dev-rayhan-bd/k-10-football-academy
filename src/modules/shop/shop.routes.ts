import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import {
  createProductZodSchema,
  updateProductZodSchema,
  createOrderZodSchema,
  addToCartZodSchema,
  updateCartItemZodSchema,
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
  verifyOrderPayment,
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from './shop.controller';

import { upload } from '@/middlewares/multer';

const router = Router();

// ==========================================
// SHOPPING CART (SIDEBAR)
// ==========================================
router.get('/cart', auth(), getCart);
router.post('/cart', auth(), validateRequest(addToCartZodSchema), addToCart);
router.patch(
  '/cart/items/:itemId',
  auth(),
  validateRequest(updateCartItemZodSchema),
  updateCartItem,
);
router.delete('/cart/items/:itemId', auth(), removeCartItem);
router.delete('/cart', auth(), clearCart);

// ==========================================
// ORDERS & STRIPE CHECKOUT
// ==========================================
router.post('/orders', auth(), validateRequest(createOrderZodSchema), createOrder);
router.post('/orders/checkout', auth(), validateRequest(createOrderZodSchema), createOrder);
router.get('/orders', auth(), getUserOrders);
router.get('/orders/:orderId/verify', auth(), verifyOrderPayment);
router.get('/orders/verify', auth(), verifyOrderPayment);

// ==========================================
// CATEGORIES
// ==========================================
router.get('/products/categories', getProductCategories);
router.get('/categories', getProductCategories);

// ==========================================
// PRODUCTS CRUD
// ==========================================
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

router.patch(
  '/products/:slug',
  auth('SUPER_ADMIN', 'ACADEMY'),
  upload.any() as any,
  validateRequest(updateProductZodSchema),
  updateProduct,
);

router.delete('/products/:slug', auth('SUPER_ADMIN', 'ACADEMY'), deleteProduct);

export const ShopRoutes = router;
