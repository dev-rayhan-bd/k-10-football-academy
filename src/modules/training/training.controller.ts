import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { trainingService } from './training.service';

export const getTrainingFormMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getFormMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Training session form metadata fetched successfully',
    data: result,
  });
});

export const getTeamsDropdown = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getTeamsDropdown(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy teams dropdown fetched successfully',
    data: result,
  });
});

export const getCoachesDropdown = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getCoachesDropdown(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy coaches dropdown fetched successfully',
    data: result,
  });
});

export const createTrainingSession = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.createSession(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Training session scheduled successfully',
    data: result,
  });
});

export const getTrainingSessions = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getSessions(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Training sessions fetched successfully',
    data: result,
  });
});

export const getTrainingSessionById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, sessionId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getSessionById(sessionId || id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Training session details fetched successfully',
    data: result,
  });
});

export const updateTrainingSession = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, sessionId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.updateSession(
    sessionId || id,
    user,
    req.body,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Training session updated successfully',
    data: result,
  });
});

export const deleteTrainingSession = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, sessionId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.deleteSession(sessionId || id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const getSessionAttendance = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, sessionId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.getSessionAttendance(
    sessionId || id,
    user,
    req.query,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Session attendance sheet fetched successfully',
    data: result,
  });
});

export const saveAttendance = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, sessionId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await trainingService.saveAttendance(
    sessionId || id,
    user,
    req.body,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.stats,
  });
});

export const markAttendance = saveAttendance;
