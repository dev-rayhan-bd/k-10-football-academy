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
