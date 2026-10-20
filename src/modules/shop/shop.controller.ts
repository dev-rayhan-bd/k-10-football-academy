import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { shopService } from './shop.service';

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const result = await shopService.createProduct(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Product created successfully',
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
  const result = await shopService.getProductById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product fetched successfully',
    data: result,
  });
});

export const createOrder = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.body.userId;
  const result = await shopService.createOrder(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Order created successfully',
    data: result,
  });
});

export const getUserOrders = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.params.userId;
  const result = await shopService.getUserOrders(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Orders fetched successfully',
    data: result,
  });
});
