import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { academyService } from './academy.service';

export const createAcademyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Academy profile created successfully',
    data: result,
  });
});

export const getAcademyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy profile fetched successfully',
    data: result,
  });
});

export const getMyAcademyProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await academyService.getMyProfile(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My academy profile fetched successfully',
    data: result,
  });
});

export const getAllAcademyProfiles = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await academyService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy profiles fetched successfully',
    meta,
    data: result,
  });
});

export const createTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.createTeam(req.params.academyId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Team created successfully',
    data: result,
  });
});

export const getTeams = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.getTeams(req.params.academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Teams fetched successfully',
    data: result,
  });
});

export const createGameReport = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.createGameReport(req.params.academyId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Game report created successfully',
    data: result,
  });
});

export const getGameReports = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.getGameReports(req.params.academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Game reports fetched successfully',
    data: result,
  });
});

export const getEvaluationDashboard = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.getEvaluationDashboard(academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy evaluation dashboard fetched successfully',
    data: result,
  });
});

export const requestPlayerEvaluation = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const managerUserId = (req as any).user.userId;
  const result = await academyService.requestPlayerEvaluation(academyId, managerUserId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Player evaluation requested successfully',
    data: result,
  });
});

export const sendEvaluationReminder = catchAsync(async (req: Request, res: Response) => {
  const managerUserId = (req as any).user.userId;
  const result = await academyService.sendEvaluationReminder(
    req.params.evaluationId,
    managerUserId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Evaluation reminder sent successfully',
    data: result,
  });
});

export const submitPlayerEvaluation = catchAsync(async (req: Request, res: Response) => {
  const coachUserId = (req as any).user.userId;
  const result = await academyService.submitPlayerEvaluation(
    req.params.evaluationId,
    coachUserId,
    req.body,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluation submitted successfully',
    data: result,
  });
});

export const getPlayerEvaluations = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const playerId = req.query.playerId as string;
  const result = await academyService.getPlayerEvaluations(academyId, playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluations fetched successfully',
    data: result,
  });
});
