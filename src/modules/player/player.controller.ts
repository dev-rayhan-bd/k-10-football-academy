import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { playerService } from './player.service';

export const createPlayerProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Player profile created successfully',
    data: result,
  });
});

export const getPlayerProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profile fetched successfully',
    data: result,
  });
});

export const getAllPlayerProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profiles fetched successfully',
    data: result,
  });
});

export const updatePlayerProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.updateProfile(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profile updated successfully',
    data: result,
  });
});

export const updatePlayerAttributes = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.updateAttributes(req.params.playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player attributes updated successfully',
    data: result,
  });
});

export const getPlayerAttributes = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getAttributes(req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player attributes fetched successfully',
    data: result,
  });
});

export const addMatchRecord = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.addMatchRecord(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Match record added successfully',
    data: result,
  });
});

export const getMatchRecords = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getMatchRecordsByPlayerId(req.params.playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Match records fetched successfully',
    data: result,
  });
});
