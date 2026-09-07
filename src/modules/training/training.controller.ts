import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { trainingService } from './training.service';

export const createTrainingSession = catchAsync(async (req: Request, res: Response) => {
  const result = await trainingService.createSession(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Training session created successfully',
    data: result,
  });
});

export const getTrainingSessions = catchAsync(async (req: Request, res: Response) => {
  const result = await trainingService.getSessionsByAcademy(req.params.academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Training sessions fetched successfully',
    data: result,
  });
});

export const markAttendance = catchAsync(async (req: Request, res: Response) => {
  const result = await trainingService.markAttendance(req.params.sessionId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Attendance updated successfully',
    data: result,
  });
});

export const getSessionAttendance = catchAsync(async (req: Request, res: Response) => {
  const result = await trainingService.getSessionAttendance(req.params.sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Session attendance fetched successfully',
    data: result,
  });
});
