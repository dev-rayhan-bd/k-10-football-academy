import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { shopService } from './shop.service';

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
  const result = await shopService.createProduct(user, req.body, files);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Product added to Uniform Store successfully',
    data: result,
  });
});

export const getAllProducts = catchAsync(async (req: Request, res: Response) => {
  const result = await shopService.getAllProducts(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Products fetched successfully',
    data: result,
  });
});

export const getProduct = catchAsync(async (req: Request, res: Response) => {
  const slugOrId = req.params.slug || req.params.id;
  const result = await shopService.getProductBySlugOrId(slugOrId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product details fetched successfully',
    data: result,
  });
});

export const getProductCategories = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.query.academyId as string;
  const result = await shopService.getProductCategories(academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product categories fetched successfully',
    data: result,
  });
});

export const updateProduct = catchAsync(async (req: Request, res: Response) => {
  const slugOrId = req.params.slug || req.params.id;
  const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
  const result = await shopService.updateProduct(slugOrId, req.body, files);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product updated successfully',
    data: result,
  });
});

export const deleteProduct = catchAsync(async (req: Request, res: Response) => {
  const slugOrId = req.params.slug || req.params.id;
  const result = await shopService.deleteProduct(slugOrId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product deleted successfully',
    data: result,
  });
});

export const createOrder = catchAsync(async (req: Request, res: Response) => {
  const userId =
    (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id || req.body.userId;
  const result = await shopService.createOrder(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Order created and Stripe checkout session generated successfully',
    data: result,
  });
});

export const verifyOrderPayment = catchAsync(async (req: Request, res: Response) => {
  const orderId = req.params.orderId || (req.query.orderId as string);
  const sessionId = (req.query.sessionId as string) || (req.query.session_id as string);
  const result = await shopService.verifyOrderPayment(orderId, sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Order payment status verified successfully',
    data: result,
  });
});

export const getUserOrders = catchAsync(async (req: Request, res: Response) => {
  const userId =
    (req as any).user?.userId ||
    (req as any).user?._id ||
    (req as any).user?.id ||
    req.params.userId;
  const result = await shopService.getUserOrders(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Orders fetched successfully',
    data: result,
  });
});

// ==========================================
// SHOPPING CART CONTROLLERS
// ==========================================

export const getCart = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
  const result = await shopService.getCart(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart fetched successfully',
    data: result,
  });
});

export const addToCart = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
  const result = await shopService.addToCart(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Item added to cart successfully',
    data: result,
  });
});

export const updateCartItem = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
  const itemId = req.params.itemId;
  const result = await shopService.updateCartItem(userId, itemId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart item updated successfully',
    data: result,
  });
});

export const removeCartItem = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
  const itemId = req.params.itemId;
  const result = await shopService.removeCartItem(userId, itemId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Item removed from cart successfully',
    data: result,
  });
});

export const clearCart = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id;
  const result = await shopService.clearCart(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart cleared successfully',
    data: result,
  });
});
