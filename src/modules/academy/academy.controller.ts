import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { academyService } from './academy.service';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { coachService } from '@/modules/coach/coach.service';
import { clubService } from '@/modules/club/club.service';

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
  const user = (req as any).user;
  if (user?.role === 'CLUB') {
    const result = await clubService.getMyClubProfile(user.userId);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Club profile fetched successfully',
      data: result,
    });
  }

  const result = await academyService.getMyProfile(user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My academy profile fetched successfully',
    data: result,
  });
});

export const updateMyAcademyProfile = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const userId = user.userId;

  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore parse error
    }
  }

  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  const folder = user?.role === 'CLUB' ? 'club_profiles' : 'academy_profiles';

  for (const f of allFiles) {
    if (
      f.fieldname === 'coverPhoto' ||
      f.fieldname === 'coverImage' ||
      f.fieldname === 'cover' ||
      f.fieldname === 'uploadCoverPhoto'
    ) {
      req.body.coverPhoto = await uploadToStorage(f, folder);
    } else if (
      f.fieldname === 'logo' ||
      f.fieldname === 'uploadLogo' ||
      f.fieldname === 'avatar' ||
      f.fieldname === 'badge' ||
      f.fieldname === 'crest'
    ) {
      req.body.logo = await uploadToStorage(f, folder);
    }
  }

  if (user?.role === 'CLUB') {
    const result = await clubService.updateMyClubProfile(userId, req.body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Club profile updated successfully',
      data: result,
    });
  }

  const result = await academyService.updateMyProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy profile updated successfully',
    data: result,
  });
});

export const updateAcademyProfileById = catchAsync(async (req: Request, res: Response) => {
  const targetId = req.params.id || req.params.academyId;
  const userId = (req as any).user?.userId;

  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore
    }
  }

  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  for (const f of allFiles) {
    if (
      f.fieldname === 'coverPhoto' ||
      f.fieldname === 'coverImage' ||
      f.fieldname === 'cover' ||
      f.fieldname === 'uploadCoverPhoto'
    ) {
      req.body.coverPhoto = await uploadToStorage(f, 'academy_profiles');
    } else if (
      f.fieldname === 'logo' ||
      f.fieldname === 'uploadLogo' ||
      f.fieldname === 'avatar' ||
      f.fieldname === 'badge'
    ) {
      req.body.logo = await uploadToStorage(f, 'academy_profiles');
    }
  }

  const result = await academyService.updateProfileById(targetId, req.body, userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy profile updated successfully',
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

export const getAcademyPlayers = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.getAcademyPlayers(academyId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy players fetched successfully',
    meta: result.meta,
    data: result,
  });
});

export const getAcademyPlayerById = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.getAcademyPlayerById(academyId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy player details fetched successfully',
    data: result,
  });
});

export const updateAcademyPlayer = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.updateAcademyPlayer(academyId, req.params.playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy player updated successfully',
    data: result,
  });
});

export const removePlayerFromAcademy = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.removePlayerFromAcademy(academyId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player removed from academy successfully',
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
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.getAcademyCoaches(academyId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy coaches fetched successfully',
    meta: result.meta,
    data: result,
  });
});

export const getAcademyCoachById = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.getAcademyCoachById(academyId, req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy coach details fetched successfully',
    data: result,
  });
});

export const updateAcademyCoach = catchAsync(async (req: Request, res: Response) => {
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const result = await academyService.updateAcademyCoach(academyId, req.params.coachId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy coach updated successfully',
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
  const paramId = req.params.academyId;
  const academyId =
    paramId && Types.ObjectId.isValid(paramId) ? paramId : (req as any).user?.userId;
  const identifier = req.params.coachId || req.params.affiliationId;
  const result = await academyService.removeCoachAffiliation(academyId, identifier);
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

// ==========================================
// ACADEMY MATCHES CONTROLLERS
// ==========================================

export const getMatchesMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getMatchesMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Matches dropdown options & metadata fetched successfully',
    data: result,
  });
});

export const getMatches = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getMatches(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scheduled matches fetched successfully',
    data: result,
  });
});

export const getMatchById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getMatchById(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scheduled match details fetched successfully',
    data: result,
  });
});

export const createMatch = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.createMatch(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.match,
  });
});

export const updateMatch = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateMatch(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.match,
  });
});

export const deleteMatch = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.deleteMatch(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ==========================================
// ACADEMY EXTRA EVENTS CONTROLLERS (SCREENSHOTS)
// ==========================================

export const getExtraEventsMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getExtraEventsMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Extra events dropdown options & metadata fetched successfully',
    data: result,
  });
});

export const getExtraEvents = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getExtraEvents(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Extra events fetched successfully',
    data: result,
  });
});

export const getExtraEventById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getExtraEventById(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Extra event details fetched successfully',
    data: result,
  });
});

export const createExtraEvent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle image upload from form-data (e.g. bannerImage, banner, or image file)
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const bannerFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'bannerImage' ||
          f.fieldname === 'banner' ||
          f.fieldname === 'image' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (bannerFile) {
      req.body.bannerImage = await uploadToStorage(bannerFile, 'academy_extra_events');
    }
  }

  const result = await academyService.createExtraEvent(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.event,
  });
});

export const updateExtraEvent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle banner image update if file is uploaded
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const bannerFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'bannerImage' ||
          f.fieldname === 'banner' ||
          f.fieldname === 'image' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (bannerFile) {
      req.body.bannerImage = await uploadToStorage(bannerFile, 'academy_extra_events');
    }
  }

  const result = await academyService.updateExtraEvent(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.event,
  });
});

export const deleteExtraEvent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.deleteExtraEvent(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const registerForExtraEvent = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.registerForExtraEvent(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// TOURNAMENT & LIVE ARENA CONTROLLERS (SCREENSHOTS)
// ==========================================

export const registerTournamentClub = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const originUrl = (req.headers.origin || req.headers.referer) as string;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if already processed
    }
  }

  // 2. Handle logo file upload if provided
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const logoFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'logo' ||
          f.fieldname === 'clubLogo' ||
          f.fieldname === 'clubLogoBadge' ||
          f.fieldname === 'logoUrl' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (logoFile) {
      req.body.logoUrl = await uploadToStorage(logoFile, 'tournament_clubs');
      req.body.badgePreset = 'CUSTOM';
      req.body.badgeName = req.body.badgeName
        ? String(req.body.badgeName).trim()
        : `${req.body.clubName || 'Club'} Logo`;
    }
  } else if (req.body.logoUrl && String(req.body.logoUrl).trim() !== '') {
    req.body.badgePreset = 'CUSTOM';
    req.body.badgeName = req.body.badgeName
      ? String(req.body.badgeName).trim()
      : `${req.body.clubName || 'Club'} Logo`;
  }

  const result = await academyService.registerTournamentClub(id, req.body, originUrl);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const verifyClubRegistrationPayment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sessionId } = req.body;
  const result = await academyService.verifyClubRegistrationPayment(id, sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.club,
  });
});

export const getTournamentRegisteredClubs = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await academyService.getTournamentRegisteredClubs(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Registered tournament clubs fetched successfully',
    data: result,
  });
});

export const getTournamentBadgePresets = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await academyService.getTournamentBadgePresets(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tournament badge presets fetched successfully',
    data: result,
  });
});

export const getTournamentClubRoster = catchAsync(async (req: Request, res: Response) => {
  const { id, clubId } = req.params;
  const result = await academyService.getTournamentClubRoster(id, clubId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club roster fetched successfully',
    data: result,
  });
});

export const allocateTournamentGroups = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.allocateTournamentGroups(
    id,
    req.body.allocations,
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

export const getAllocatedGroups = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAllocatedGroups(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tournament allocated groups fetched successfully',
    data: result,
  });
});

export const startTournamentAndGenerateFixtures = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = (req as any).user;
    const academyIdentifier = req.params.academyId;
    const result = await academyService.startTournamentAndGenerateFixtures(
      id,
      user,
      academyIdentifier,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: result.message,
      data: result,
    });
  },
);

export const updateTournamentFixture = catchAsync(async (req: Request, res: Response) => {
  const { id, matchId } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateTournamentFixture(
    id,
    matchId,
    req.body,
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

export const recordMatchResult = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.recordMatchResult(id, req.body, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const getTournamentFixtures = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const query = {
    group: req.query.group as string | undefined,
    stage: req.query.stage as string | undefined,
    status: req.query.status as string | undefined,
  };
  const result = await academyService.getTournamentFixtures(id, query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tournament fixtures fetched successfully',
    data: result,
  });
});

export const getTournamentArena = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const options = {
    tab: req.query.tab as string | undefined,
    group: req.query.group as string | undefined,
    stage: req.query.stage as string | undefined,
  };
  const result = await academyService.getTournamentArena(id, options);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tournament arena data fetched successfully',
    data: result,
  });
});

export const getTournamentPublicPortal = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await academyService.getTournamentPublicPortal(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Public tournament live portal data fetched successfully',
    data: result,
  });
});

export const resetTournamentFlow = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.resetTournamentFlow(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const simulateTournamentStage = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.simulateTournamentStage(
    id,
    req.body,
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
// ACADEMY SPONSORS CONTROLLERS (SCREENSHOTS)
// ==========================================

export const getSponsorsMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSponsorsMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Sponsors dropdown options & metadata fetched successfully',
    data: result,
  });
});

export const getSponsors = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSponsors(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy sponsors fetched successfully',
    data: result,
  });
});

export const getSponsorById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSponsorById(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Sponsor details fetched successfully',
    data: result,
  });
});

export const createSponsor = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.createSponsor(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.sponsor,
  });
});

export const updateSponsor = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateSponsor(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.sponsor,
  });
});

export const deleteSponsor = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.deleteSponsor(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ==========================================
// ACADEMY NEWS CONTROLLERS (SCREENSHOTS)
// ==========================================

export const getAcademyNewsMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyNewsMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy news metadata & tab counts fetched successfully',
    data: result,
  });
});

export const getAcademyNews = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyNews(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy news articles fetched successfully',
    data: result,
  });
});

export const getAcademyNewsById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyNewsById(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy news article details fetched successfully',
    data: result,
  });
});

export const createAcademyNews = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle featured image upload from form-data
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'featuredImage' ||
          f.fieldname === 'image' ||
          f.fieldname === 'banner' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      req.body.featuredImage = await uploadToStorage(imgFile, 'academy_news');
    }
  }

  const result = await academyService.createAcademyNews(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.article,
  });
});

export const updateAcademyNews = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle featured image update if file is uploaded
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'featuredImage' ||
          f.fieldname === 'image' ||
          f.fieldname === 'banner' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      req.body.featuredImage = await uploadToStorage(imgFile, 'academy_news');
    }
  }

  const result = await academyService.updateAcademyNews(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.article,
  });
});

export const toggleNewsVisibility = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.toggleNewsVisibility(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const moveNewsToBin = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.moveNewsToBin(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const restoreNewsFromBin = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.restoreNewsFromBin(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.article,
  });
});

export const deleteNewsPermanently = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.deleteNewsPermanently(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ==========================================
// ACADEMY SUCCESS STORY CONTROLLERS (SCREENSHOTS)
// ==========================================

export const getSuccessStoriesMeta = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSuccessStoriesMeta(user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success stories metadata fetched successfully',
    data: result,
  });
});

export const getSuccessStories = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSuccessStories(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success stories fetched successfully',
    data: result,
  });
});

export const getSuccessStoryById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getSuccessStoryById(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success story details fetched successfully',
    data: result,
  });
});

export const createSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle photo upload from form-data
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'photo' ||
          f.fieldname === 'image' ||
          f.fieldname === 'file' ||
          f.fieldname === 'uploadPhoto',
      ) || allFiles[0];

    if (imgFile) {
      req.body.photo = await uploadToStorage(imgFile, 'academy_success_stories');
    }
  }

  const result = await academyService.createSuccessStory(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result.story,
  });
});

export const updateSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore JSON parse error if data is already processed
    }
  }

  // 2. Handle photo upload from form-data
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'photo' ||
          f.fieldname === 'image' ||
          f.fieldname === 'file' ||
          f.fieldname === 'uploadPhoto',
      ) || allFiles[0];

    if (imgFile) {
      req.body.photo = await uploadToStorage(imgFile, 'academy_success_stories');
    }
  }

  const result = await academyService.updateSuccessStory(id, user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.story,
  });
});

export const updateSuccessStoryStatus = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.updateSuccessStoryStatus(
    id,
    user,
    status,
    rejectionReason,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.story,
  });
});

export const deleteSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.deleteSuccessStory(id, user, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// ==========================================
// ACADEMY GAME REPORTS & VALIDATE CV CONTROLLERS (SCREENSHOTS)
// ==========================================

export const getAcademyGameReportsDashboard = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyGameReportsDashboard(
    user,
    req.query,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy game reports dashboard fetched successfully',
    data: result,
  });
});

export const getAcademyValidateCvDashboard = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getAcademyValidateCvDashboard(
    user,
    req.query,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy validate CV dashboard fetched successfully',
    data: result,
  });
});

export const notifyCoachForCvValidation = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.notifyCoachForCvValidation(user, req.body, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// ACADEMY PLAYER EVALUATIONS (SCREENSHOT 1 & 2)
// ==========================================

export const getAcademyPlayerEvaluationDashboard = catchAsync(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const academyIdentifier = req.params.academyId || user?.userId;
    const result = await academyService.getAcademyPlayerEvaluationDashboard(
      academyIdentifier,
      req.query as Record<string, unknown>,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Academy player evaluations dashboard fetched successfully',
      data: result,
    });
  },
);

export const getAcademyPlayerEvaluationDetails = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId || user?.userId;
  const targetId = req.params.id || req.params.evaluationId;
  const result = await academyService.getAcademyPlayerEvaluationDetails(
    targetId,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluation details fetched successfully',
    data: result,
  });
});

export const getAcademyPlayerEvaluationPdfData = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const targetId = req.params.id || req.params.evaluationId;
  const result = await coachService.getPlayerEvaluationProgressPdfData(user?.userId, targetId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluation progress report for download retrieved successfully',
    data: result,
  });
});

// ==========================================
// ACADEMY ANALYTICS REPORT CONTROLLERS (SCREENSHOTS 1-6)
// ==========================================

export const getAcademyAnalyticsReport = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const query = { ...req.query };
  if (req.params.year) {
    query.year = req.params.year;
  }
  const result = await academyService.getAcademyAnalyticsReport(user, query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy analytics report fetched successfully',
    data: result,
  });
});

export const exportAcademyAnalyticsReport = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const query = { ...req.query };
  if (req.params.year) {
    query.year = req.params.year;
  }
  const result = await academyService.exportAcademyAnalyticsReport(user, query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Analytics report exported successfully',
    data: result,
  });
});

export const getAcademyManagementDashboard = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const query = { ...req.query };
  if (req.params.year) {
    query.year = req.params.year;
  }
  const result = await academyService.getAcademyManagementDashboard(user, query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy management dashboard fetched successfully',
    data: result,
  });
});

// ==========================================
// CVS LIBRARY & PERFORMANCE ANALYTICS
// ==========================================

export const getCvsLibrary = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const result = await academyService.getCvsLibrary(user, req.query, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'CVs library fetched successfully',
    data: result,
  });
});

export const toggleLikePlayerCv = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const { playerId } = req.params;
  const result = await academyService.toggleLikePlayerCv(user, playerId, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const sharePlayerCv = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const { playerId } = req.params;
  const result = await academyService.sharePlayerCv(user, playerId, academyIdentifier);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const getAcademyPerformanceAnalytics = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const academyIdentifier = req.params.academyId;
  const query = { ...req.query };
  if (req.params.year) {
    query.year = req.params.year;
  }
  const result = await academyService.getAcademyPerformanceAnalytics(
    user,
    query,
    academyIdentifier,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Academy performance analytics fetched successfully',
    data: result,
  });
});

export const getPublicPlayerCv = catchAsync(async (req: Request, res: Response) => {
  const { playerId } = req.params;
  const result = await academyService.getPublicPlayerCv(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Public player CV fetched successfully',
    data: result,
  });
});
