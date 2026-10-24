import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { parentService } from './parent.service';

export const switchProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.switchProfile(req.user!.userId, req.body.childUserId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile switched to child successfully',
    data: result,
  });
});

export const switchToParent = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.switchToParent(
    req.user!.userId,
    req.body?.parentId,
    (req.user as any)?.parentUserId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile switched back to parent successfully',
    data: result,
  });
});

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
  const parentId = (req as any).user?.userId || req.params.parentId;
  const result = await parentService.linkChild(parentId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Child linked successfully',
    data: result,
  });
});

export const getMyChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getChildren((req as any).user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Linked children fetched successfully for dropdown',
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

export const getChildTrainingSessions = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await parentService.getChildTrainingSessions(userId, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Child training sessions fetched successfully',
    data: result,
  });
});

export const submitParentRsvp = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const sessionId = req.params.sessionId || req.body.sessionId;
  const result = await parentService.submitParentRsvp(userId, sessionId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});
