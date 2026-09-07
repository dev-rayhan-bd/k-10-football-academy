import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { parentService } from './parent.service';

export const createParentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Parent profile created successfully',
    data: result,
  });
});

export const getParentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parent profile fetched successfully',
    data: result,
  });
});

export const linkChild = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.linkChild(req.params.parentId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Child linked successfully',
    data: result,
  });
});

export const getChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getChildren(req.params.parentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Children fetched successfully',
    data: result,
  });
});

export const createMatchReport = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.createMatchReport(req.params.parentId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Parent match report created successfully',
    data: result,
  });
});

export const getMatchReports = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getMatchReports(req.params.parentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Match reports fetched successfully',
    data: result,
  });
});
