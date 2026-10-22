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

export const getCoachAndPlayersDashboard = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.getCoachAndPlayersDashboard(academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach and players dashboard data fetched successfully',
    data: result,
  });
});

export const getAvailableMembers = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.getAvailableMembers(academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Available coaches and players fetched successfully',
    data: result,
  });
});

export const createTeam = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.createTeam(academyId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Team created successfully',
    data: result,
  });
});

export const getTeams = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.getTeams(academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Teams fetched successfully',
    data: result,
  });
});

export const getTeamById = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.getTeamById(req.params.teamId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Team fetched successfully',
    data: result,
  });
});

export const updateTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.updateTeam(req.params.teamId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Team updated successfully',
    data: result,
  });
});

export const deleteTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.deleteTeam(req.params.teamId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const upgradePlan = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const { plan, maxTeams } = req.body;
  const result = await academyService.upgradePlan(academyId, plan, maxTeams);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
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

export const inviteCoach = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const managerUserId = (req as any).user.userId;
  const result = await academyService.inviteCoach(academyId, managerUserId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Coach invitation sent successfully',
    data: result,
  });
});

export const requestCoachAffiliation = catchAsync(async (req: Request, res: Response) => {
  const coachUserId = (req as any).user.userId;
  const result = await academyService.requestCoachAffiliation(coachUserId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Affiliation request sent to academy successfully',
    data: result,
  });
});

export const getAcademyCoaches = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const status = req.query.status as string;
  const result = await academyService.getAcademyCoaches(academyId, status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy coaches fetched successfully',
    data: result,
  });
});

export const getCoachAffiliations = catchAsync(async (req: Request, res: Response) => {
  const coachUserId = (req as any).user.userId;
  const result = await academyService.getCoachAffiliations(coachUserId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach affiliations fetched successfully',
    data: result,
  });
});

export const respondToCoachAffiliation = catchAsync(async (req: Request, res: Response) => {
  const responderUserId = (req as any).user.userId;
  const { action, responseNote } = req.body;
  const result = await academyService.respondToCoachAffiliation(
    req.params.affiliationId,
    responderUserId,
    action,
    responseNote,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Affiliation request ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
    data: result,
  });
});

export const removeCoachAffiliation = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.removeCoachAffiliation(academyId, req.params.affiliationId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.affiliation,
  });
});
