import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { clubService } from './club.service';

export const getMyClubProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getMyClubProfile(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club profile fetched successfully',
    data: result,
  });
});

export const updateMyClubProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

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
      req.body.coverPhoto = await uploadToStorage(f, 'club_profiles');
    } else if (
      f.fieldname === 'logo' ||
      f.fieldname === 'uploadLogo' ||
      f.fieldname === 'avatar' ||
      f.fieldname === 'crest'
    ) {
      req.body.logo = await uploadToStorage(f, 'club_profiles');
    } else if (
      f.fieldname === 'authorizationDocument' ||
      f.fieldname === 'authorizationDoc' ||
      f.fieldname === 'authorizationLetter'
    ) {
      req.body.authorizationDocument = await uploadToStorage(f, 'club_verification_docs');
    } else if (
      f.fieldname === 'clubRegistrationDocument' ||
      f.fieldname === 'clubRegistrationDoc' ||
      f.fieldname === 'registrationDoc'
    ) {
      req.body.clubRegistrationDocument = await uploadToStorage(f, 'club_verification_docs');
    }
  }

  const result = await clubService.updateMyClubProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club profile updated successfully',
    data: result,
  });
});

export const createClubProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Club profile created successfully',
    data: result,
  });
});

export const getClubProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club profile fetched successfully',
    data: result,
  });
});

export const getAllClubProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club profiles fetched successfully',
    data: result,
  });
});

export const addAchievement = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.addAchievement(req.params.clubId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Achievement added successfully',
    data: result,
  });
});

export const getAchievements = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.getAchievements(req.params.clubId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Achievements fetched successfully',
    data: result,
  });
});

export const addFavourite = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.addFavourite(req.params.clubId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Favourite added successfully',
    data: result,
  });
});

export const getFavourites = catchAsync(async (req: Request, res: Response) => {
  const result = await clubService.getFavourites(req.params.clubId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Favourites fetched successfully',
    data: result,
  });
});

// ==========================================
// SCOUTING BOARD (SCREENSHOTS 1 & 2)
// ==========================================
export const getScoutingBoard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getScoutingBoard(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Scouting board fetched successfully',
    data: result,
  });
});

export const toggleScoutingFavourite = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.toggleScoutingFavourite(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const shareScoutingProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.shareScoutingProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// CVS LIBRARY (SCREENSHOT 3)
// ==========================================
export const getClubCvsLibrary = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getClubCvsLibrary(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'CVs library fetched successfully',
    data: result,
  });
});

export const toggleLikePlayerCv = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.toggleLikePlayerCv(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const sharePlayerCv = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.sharePlayerCv(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// SUCCESS STORIES (SCREENSHOTS 4 & 5)
// ==========================================
export const getClubSuccessStories = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getClubSuccessStories(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success stories fetched successfully',
    data: result,
  });
});

export const createClubSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

  // 1. Support multipart form-data 'data' JSON string if present
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      const parsed = JSON.parse(req.body.data);
      req.body = { ...req.body, ...parsed };
      delete req.body.data;
    } catch {
      // Ignore
    }
  }

  // 2. Handle cover image upload from form-data
  const allFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
      ? [req.file as Express.Multer.File]
      : [];

  if (allFiles.length > 0) {
    const imgFile =
      allFiles.find(
        (f) =>
          f.fieldname === 'coverImage' ||
          f.fieldname === 'photo' ||
          f.fieldname === 'image' ||
          f.fieldname === 'cover' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      const uploadedUrl = await uploadToStorage(imgFile, 'club_success_stories');
      req.body.coverImage = uploadedUrl;
      req.body.photo = uploadedUrl;
    }
  }

  const result = await clubService.createClubSuccessStory(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Success story created successfully',
    data: result,
  });
});

export const updateClubSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

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
          f.fieldname === 'coverImage' ||
          f.fieldname === 'photo' ||
          f.fieldname === 'image' ||
          f.fieldname === 'cover' ||
          f.fieldname === 'file',
      ) || allFiles[0];

    if (imgFile) {
      const uploadedUrl = await uploadToStorage(imgFile, 'club_success_stories');
      req.body.coverImage = uploadedUrl;
      req.body.photo = uploadedUrl;
    }
  }

  const result = await clubService.updateClubSuccessStory(userId, req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success story updated successfully',
    data: result,
  });
});

export const deleteClubSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.deleteClubSuccessStory(userId, req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// 5. CLUB ANALYTICS (SCREENSHOTS 2 & 3)
// ==========================================
export const getClubAnalytics = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getClubAnalytics(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club analytics fetched successfully',
    data: result,
  });
});

export const recordPlayerView = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.recordPlayerView(userId, req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// 6. CLUB DASHBOARD (REAL-TIME DB DASHBOARD)
// ==========================================
export const getClubDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await clubService.getClubDashboard(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club dashboard analytics fetched successfully',
    data: result,
  });
});
