import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { agentService } from './agent.service';
import { clubService } from '@/modules/club/club.service';

export const getMyAgentProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await agentService.getMyAgentProfile(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Agent profile fetched successfully',
    data: result,
  });
});

export const updateMyAgentProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;

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
      f.fieldname === 'licenseCertificateDocument' ||
      f.fieldname === 'licenseCertificate' ||
      f.fieldname === 'fifaLicenseDoc' ||
      f.fieldname === 'licenseDoc'
    ) {
      req.body.licenseCertificateDocument = await uploadToStorage(f, 'agent_verification_docs');
    } else if (
      f.fieldname === 'identityDocument' ||
      f.fieldname === 'passport' ||
      f.fieldname === 'nationalId' ||
      f.fieldname === 'nid' ||
      f.fieldname === 'idDoc'
    ) {
      req.body.identityDocument = await uploadToStorage(f, 'agent_verification_docs');
    } else if (
      f.fieldname === 'associationMembershipDocument' ||
      f.fieldname === 'associationDocument' ||
      f.fieldname === 'membershipDocument' ||
      f.fieldname === 'agencyDoc'
    ) {
      req.body.associationMembershipDocument = await uploadToStorage(f, 'agent_verification_docs');
    } else if (
      f.fieldname === 'coverPhoto' ||
      f.fieldname === 'cover' ||
      f.fieldname === 'coverImage'
    ) {
      req.body.coverPhoto = await uploadToStorage(f, 'agent_covers');
    } else if (
      f.fieldname === 'avatar' ||
      f.fieldname === 'profileImage' ||
      f.fieldname === 'photo' ||
      f.fieldname === 'image'
    ) {
      req.body.avatar = await uploadToStorage(f, 'avatars');
    }
  }

  const result = await agentService.updateMyAgentProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Agent profile updated successfully',
    data: result,
  });
});

export const createAgentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await agentService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Agent profile created successfully',
    data: result,
  });
});

export const getAgentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await agentService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Agent profile fetched successfully',
    data: result,
  });
});

export const uploadVerificationDoc = catchAsync(async (req: Request, res: Response) => {
  const targetId =
    req.params.agentId && req.params.agentId !== 'me'
      ? req.params.agentId
      : (req as any).user?.userId || (req as any).user?.id;

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

  let result;
  if (allFiles.length > 0) {
    for (const f of allFiles) {
      const fileUrl = await uploadToStorage(f, 'agent_verification_docs');
      let docType = req.body.documentType;

      if (
        f.fieldname === 'licenseCertificateDocument' ||
        f.fieldname === 'licenseCertificate' ||
        f.fieldname === 'fifaLicenseDoc' ||
        f.fieldname === 'licenseDoc'
      ) {
        docType = 'LICENSE_CERTIFICATE';
      } else if (
        f.fieldname === 'identityDocument' ||
        f.fieldname === 'passport' ||
        f.fieldname === 'nationalId' ||
        f.fieldname === 'nid' ||
        f.fieldname === 'idDoc'
      ) {
        docType = 'NATIONAL_ID_PASSPORT';
      } else if (
        f.fieldname === 'associationMembershipDocument' ||
        f.fieldname === 'associationDocument' ||
        f.fieldname === 'membershipDocument' ||
        f.fieldname === 'agencyDoc'
      ) {
        docType = 'ASSOCIATION_MEMBERSHIP';
      }

      result = await agentService.uploadVerificationDocument(targetId, {
        documentType: docType || 'LICENSE_CERTIFICATE',
        fileUrl,
      });
    }
  } else if (req.body.fileUrl && req.body.documentType) {
    result = await agentService.uploadVerificationDocument(targetId, req.body);
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Verification document uploaded successfully',
    data: result,
  });
});

export const getVerificationDocs = catchAsync(async (req: Request, res: Response) => {
  const targetId =
    req.params.agentId && req.params.agentId !== 'me'
      ? req.params.agentId
      : (req as any).user?.userId || (req as any).user?.id;

  const result = await agentService.getVerificationDocuments(targetId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification documents fetched successfully',
    data: result,
  });
});

export const createSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id || req.body.creatorId;
  const userRole = (req as any).user?.role || 'AGENT';

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

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'image' ||
          f.fieldname === 'photo' ||
          f.fieldname === 'coverImage' ||
          f.fieldname === 'cover' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      const uploadedUrl = await uploadToStorage(imgFile, 'agent_success_stories');
      req.body.image = uploadedUrl;
      req.body.photo = uploadedUrl;
    }
  }

  const result = await agentService.createSuccessStory(userId, req.body, userRole);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Success story submitted for approval successfully',
    data: result,
  });
});

export const getSuccessStories = catchAsync(async (req: Request, res: Response) => {
  const callerUser = (req as any).user;
  const result = await agentService.getSuccessStories(req.query, callerUser);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success stories fetched successfully',
    data: result,
  });
});

export const getSuccessStoryById = catchAsync(async (req: Request, res: Response) => {
  const callerUser = (req as any).user;
  const result = await agentService.getSuccessStoryById(req.params.id, callerUser);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success story fetched successfully',
    data: result,
  });
});

export const updateSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id;
  const userRole = (req as any).user?.role || 'AGENT';

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

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'image' ||
          f.fieldname === 'photo' ||
          f.fieldname === 'coverImage' ||
          f.fieldname === 'cover' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      const uploadedUrl = await uploadToStorage(imgFile, 'agent_success_stories');
      req.body.image = uploadedUrl;
      req.body.photo = uploadedUrl;
    }
  }

  const result = await agentService.updateSuccessStory(userId, req.params.id, req.body, userRole);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success story updated successfully',
    data: result,
  });
});

export const deleteSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId || (req as any).user?.id;
  const userRole = (req as any).user?.role || 'AGENT';
  const result = await agentService.deleteSuccessStory(userId, req.params.id, userRole);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const reviewSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, adminReviewNotes } = req.body;
  const result = await agentService.reviewSuccessStory(id, status, adminReviewNotes);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Success story ${status ? status.toLowerCase() : 'reviewed'} successfully`,
    data: result,
  });
});

export const getAgentDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await agentService.getAgentDashboard(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Agent dashboard fetched successfully',
    data: result,
  });
});

export const getAgentScoutingBoard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.getScoutingBoard(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scouting board fetched successfully',
    data: result,
  });
});

export const getAgentScoutingBoardPlayers = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.getScoutingBoardPlayers(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scouting board players fetched successfully',
    data: result,
  });
});

export const getAgentScoutingBoardCoaches = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.getScoutingBoardCoaches(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scouting board coaches fetched successfully',
    data: result,
  });
});

export const toggleAgentScoutingFavourite = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.toggleScoutingFavourite(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message:
      result.message || (result.isFavourite ? 'Added to favourites' : 'Removed from favourites'),
    data: result,
  });
});

export const shareAgentScoutingProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.shareScoutingProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile share link generated successfully',
    data: result,
  });
});

export const getAgentCvsLibrary = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.getClubCvsLibrary(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'CVs library fetched successfully',
    data: result,
  });
});

export const toggleLikeAgentPlayerCv = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.toggleLikePlayerCv(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message || (result.isLiked ? 'Player CV liked' : 'Player CV unliked'),
    data: result,
  });
});

export const shareAgentPlayerCv = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.sharePlayerCv(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player CV shared successfully',
    data: result,
  });
});

export const getAgentAnalytics = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await agentService.getAgentAnalytics(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Agent analytics fetched successfully',
    data: result,
  });
});

export const recordAgentPlayerView = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId || (req as any).user.id;
  const result = await clubService.recordPlayerView(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});
