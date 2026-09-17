import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { playerService } from './player.service';
import { uploadToStorage } from '@/utils/fileUpload.utils';

export const createPlayerProfile = catchAsync(async (req: Request, res: Response) => {
  const payload = {
    ...req.body,
    userId: req.user?.userId,
  };

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'profileImage') {
        payload.profileImage = await uploadToStorage(file, 'player_profiles');
      } else if (file.fieldname === 'highlightVideo') {
        payload.highlightVideo = await uploadToStorage(file, 'player_videos');
      }
    }
  }

  const result = await playerService.createProfile(payload);
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
  const payload = { ...req.body };
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'profileImage') {
        payload.profileImage = await uploadToStorage(file, 'player_profiles');
      } else if (file.fieldname === 'highlightVideo') {
        payload.highlightVideo = await uploadToStorage(file, 'player_videos');
      }
    }
  }

  const result = await playerService.updateProfile(req.params.id, payload);
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
  const payload = {
    ...req.body,
    playerId: req.params.playerId || req.body.playerId,
  };
  const result = await playerService.addMatchRecord(payload);
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

export const uploadHighlightVideo = catchAsync(async (req: Request, res: Response) => {
  const playerId = req.params.playerId || req.user?.userId;
  let videoUrl = '';
  let thumbnailUrl = '';
  let imageUrl = '';

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'thumbnail') {
        thumbnailUrl = await uploadToStorage(file, 'player_thumbnails');
      } else if (
        file.mimetype.startsWith('video/') ||
        file.fieldname === 'video' ||
        file.fieldname === 'highlightVideo'
      ) {
        videoUrl = await uploadToStorage(file, 'player_videos');
      } else if (
        file.mimetype.startsWith('image/') ||
        file.fieldname === 'image' ||
        file.fieldname === 'photo'
      ) {
        imageUrl = await uploadToStorage(file, 'player_images');
      } else if (file.fieldname === 'file') {
        // generic file field
        if (file.mimetype.startsWith('video/')) {
          videoUrl = await uploadToStorage(file, 'player_videos');
        } else {
          imageUrl = await uploadToStorage(file, 'player_images');
        }
      }
    }
  }

  let title = req.body.title || '';
  if (!title && req.body.data) {
    try {
      const parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      title = parsed.title || '';
    } catch {
      // Ignore JSON parse errors
    }
  }

  const mediaUrl = videoUrl || imageUrl;

  const result = await playerService.uploadHighlightVideo(
    playerId as string,
    mediaUrl,
    thumbnailUrl,
    title,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Media uploaded successfully',
    data: result,
  });
});
