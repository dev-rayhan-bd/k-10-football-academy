import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { playerService } from './player.service';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { AppError } from '@/utils/AppError';

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
  const targetId =
    req.params.id === 'me' || !req.params.id ? req.user?.userId || req.params.id : req.params.id;
  const result = await playerService.getProfileById(targetId, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profile fetched successfully',
    data: result,
  });
});

export const getPlayerCV = catchAsync(async (req: Request, res: Response) => {
  const targetId =
    req.params.id === 'me' || !req.params.id ? req.user?.userId || req.params.id : req.params.id;
  const result = await playerService.getCVProfile(targetId, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player CV fetched successfully',
    data: result,
  });
});

export const addClubInterest = catchAsync(async (req: Request, res: Response) => {
  const playerId = req.params.playerId || req.params.id;
  const result = await playerService.addClubInterest(playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club interest recorded successfully',
    data: result,
  });
});

export const getAllPlayerProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profiles fetched successfully',
    meta: result.meta,
    data: result.result,
  });
});

export const updatePlayerProfile = catchAsync(async (req: Request, res: Response) => {
  const payload = { ...req.body };
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'profileImage' || file.fieldname === 'avatar') {
        payload.profileImage = await uploadToStorage(file, 'player_profiles');
      } else if (file.fieldname === 'highlightVideo') {
        payload.highlightVideo = await uploadToStorage(file, 'player_videos');
      }
    }
  }

  if (typeof payload.secondaryPositions === 'string') {
    try {
      payload.secondaryPositions = JSON.parse(payload.secondaryPositions);
    } catch {
      payload.secondaryPositions = payload.secondaryPositions
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  const targetId =
    req.params.id === 'me' || !req.params.id ? req.user?.userId || req.params.id : req.params.id;

  const result = await playerService.updateProfile(targetId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profile updated successfully',
    data: result,
  });
});

const resolvePlayerId = (req: Request): string => {
  const param = req.params.playerId || req.params.id;
  if (param && param !== 'me') {
    return param;
  }
  return (req.user as any)?.userId || '';
};

export const updatePlayerAttributes = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.updateAttributes(playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player attributes updated successfully',
    data: result,
  });
});

export const getPlayerAttributes = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.getAttributes(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player attributes fetched successfully',
    data: result,
  });
});

export const updatePlayerStyles = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.updatePlayerStyles(playerId, req.body.playerStyles);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player styles updated successfully',
    data: result,
  });
});

export const updateClubHistory = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.updateClubHistory(playerId, req.body.clubHistory);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club history updated successfully',
    data: result,
  });
});

export const addClubHistoryItem = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.addClubHistoryItem(playerId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Club added to history successfully',
    data: result,
  });
});

export const updatePitchMap = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }
  const result = await playerService.updatePitchMap(playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pitch map updated successfully',
    data: result,
  });
});

export const addMatchRecord = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req) || req.body.playerId;
  const payload = {
    ...req.body,
    playerId,
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
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }
  const result = await playerService.getMatchRecordsByPlayerId(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Match records fetched successfully',
    data: result,
  });
});

export const uploadHighlightVideo = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }
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
    message: 'Highlight video uploaded successfully',
    data: result,
  });
});

export const uploadMediaGallery = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }
  let videoUrl = '';
  let thumbnailUrl = '';
  let imageUrl = '';

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'thumbnail') {
        thumbnailUrl = await uploadToStorage(file, 'player_thumbnails');
      } else if (file.mimetype.startsWith('video/') || file.fieldname === 'video') {
        videoUrl = await uploadToStorage(file, 'player_videos');
      } else if (
        file.mimetype.startsWith('image/') ||
        file.fieldname === 'image' ||
        file.fieldname === 'photo'
      ) {
        imageUrl = await uploadToStorage(file, 'player_images');
      } else if (file.fieldname === 'file') {
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
  if (!mediaUrl) {
    throw new AppError(400, 'No media file provided');
  }

  const result = await playerService.uploadMediaGallery(
    playerId as string,
    mediaUrl,
    thumbnailUrl,
    title,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Media uploaded to gallery successfully',
    data: result,
  });
});

export const getMediaGallery = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const mediaType = (req.query.mediaType as string) || (req.query.type as string);

  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const result = await playerService.getMediaGallery(playerId, page, limit, mediaType);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Media gallery fetched successfully',
    data: result,
  });
});
