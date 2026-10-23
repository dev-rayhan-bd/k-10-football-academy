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

export const purchasePremiumPlan = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.purchasePremiumPlan(academyId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const createPlanCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const academyId = req.params.academyId || (req as any).user.userId;
  const result = await academyService.createPlanCheckoutSession(academyId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Stripe checkout session created successfully',
    data: result,
  });
});

export const verifyStripePayment = catchAsync(async (req: Request, res: Response) => {
  const sessionId = req.body.sessionId || (req.query.sessionId as string);
  const result = await academyService.verifyStripePayment(sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: result.success,
    message: result.message,
    data: result.data || result,
  });
});

export const getTeamRoster = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.getTeamRoster(req.params.teamId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Team roster fetched successfully',
    data: result,
  });
});

export const getAvailableCoachesForTeam = catchAsync(async (req: Request, res: Response) => {
  const targetId = req.params.teamId || (req.query.teamId as string) || (req as any).user.userId;
  const search = req.query.search as string;
  const result = await academyService.getAvailableCoachesForTeam(targetId, search);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Available coaches fetched successfully',
    data: result,
  });
});

export const assignCoachToTeam = catchAsync(async (req: Request, res: Response) => {
  const { coachId, role } = req.body;
  const result = await academyService.assignCoachToTeam(req.params.teamId, coachId, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const removeCoachFromTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.removeCoachFromTeam(req.params.teamId, req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const getAvailablePlayersForTeam = catchAsync(async (req: Request, res: Response) => {
  const targetId = req.params.teamId || (req.query.teamId as string) || (req as any).user.userId;
  const search = req.query.search as string;
  const result = await academyService.getAvailablePlayersForTeam(targetId, search);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Available players fetched successfully',
    data: result,
  });
});

export const assignPlayerToTeam = catchAsync(async (req: Request, res: Response) => {
  const { playerId } = req.body;
  const result = await academyService.assignPlayerToTeam(req.params.teamId, playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const removePlayerFromTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await academyService.removePlayerFromTeam(req.params.teamId, req.params.playerId);
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

export const getTransferRequestsDashboard = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getTransferRequestsDashboard(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Transfer requests dashboard retrieved successfully',
    data: result,
  });
});

export const getTargetAcademiesForTransfer = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getTargetAcademiesForTransfer(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Target academies for transfer retrieved successfully',
    data: result,
  });
});

export const getMyAcademyPlayersForTransfer = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getMyAcademyPlayersForTransfer(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy athletes for transfer retrieved successfully',
    data: result,
  });
});

export const getTransferRequestById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await academyService.getTransferRequestById(req.params.id, user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Transfer request details fetched successfully',
    data: result,
  });
});

export const createTransferRequest = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await academyService.createTransferRequest(user, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.transfer,
  });
});

export const respondToTransferRequest = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { status, responseNote } = req.body || {};
  const result = await academyService.respondToTransferRequest(id, user, status, responseNote);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.transfer,
  });
});

export const approveTransferRequest = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { responseNote } = req.body || {};
  const result = await academyService.respondToTransferRequest(id, user, 'APPROVED', responseNote);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.transfer,
  });
});

export const rejectTransferRequest = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { responseNote } = req.body;
  const result = await academyService.respondToTransferRequest(id, user, 'REJECTED', responseNote);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.transfer,
  });
});

// ==========================================
// PARENT MANAGEMENT CONTROLLERS
// ==========================================

export const getAcademyParents = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyParents(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy parents fetched successfully',
    data: result,
  });
});

export const getAvailablePlayersForParentLinking = catchAsync(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const academyIdentifier = req.params.academyId;
    const result = await academyService.getAvailablePlayersForParentLinking(
      user,
      req.query,
      academyIdentifier,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Available academy athletes for parent linking fetched successfully',
      data: result,
    });
  },
);

export const onboardParent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.onboardParent(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result,
  });
});

export const getAcademyParentById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, parentId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyParentById(parentId || id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parent profile details fetched successfully',
    data: result,
  });
});

export const updateAcademyParent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, parentId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateAcademyParent(
    parentId || id,
    user,
    req.body,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parent profile updated successfully',
    data: result,
  });
});

export const unlinkParentFromAcademy = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, parentId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.unlinkParentFromAcademy(
    parentId || id,
    user,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const linkPlayerToParent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, parentId } = req.params;
  const { playerId, relationship } = req.body;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.linkPlayerToParent(
    parentId || id,
    playerId,
    relationship,
    user,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const unlinkPlayerFromParent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id, parentId, playerId } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.unlinkPlayerFromParent(
    parentId || id,
    playerId || req.body.playerId,
    user,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// FEES & PAYMENTS CONTROLLERS (SCREENSHOT 1)
// ==========================================

export const getFeesPayments = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getFeesPayments(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fees and payments fetched successfully',
    data: result,
  });
});

export const createFeePayment = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.createFeePayment(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.payment,
  });
});

export const updateFeePaymentStatus = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateFeePaymentStatus(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.payment,
  });
});

export const getFeesPaymentsExport = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getFeesPaymentsExport(user, req.query, academyIdentifier);

  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.status(200).send(result.csvContent);
    return;
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fees and payments export data generated successfully',
    data: result,
  });
});

// ==========================================
// FINANCE COMMITTEE CONTROLLERS (SCREENSHOT 2)
// ==========================================

export const getFinanceCommittee = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getFinanceCommittee(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Finance committee data fetched successfully',
    data: result,
  });
});

export const createFinanceTransaction = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.createFinanceTransaction(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.transaction,
  });
});

export const updateFinanceTransactionStatus = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateFinanceTransactionStatus(
    id,
    user,
    req.body,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.transaction,
  });
});
