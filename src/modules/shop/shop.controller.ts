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
  const userId = (req as any).user?.id || (req as any).user?._id || req.body.userId;
  const result = await shopService.createOrder(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Order created successfully',
    data: result,
  });
});

export const getUserOrders = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || (req as any).user?._id || req.params.userId;
  const result = await shopService.getUserOrders(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Orders fetched successfully',
    data: result,
  });
});
