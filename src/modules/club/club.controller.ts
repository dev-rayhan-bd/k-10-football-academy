import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { clubService } from './club.service';

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
