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
  const caller = req.user;
  const body = { ...req.body };
  if (!body.clubName && !body.agentName) {
    if (caller?.role === 'AGENT') {
      body.agentName = (caller as any).name || 'Football Agent';
    } else if (caller?.role === 'CLUB') {
      body.clubName = (caller as any).name || 'Professional Club';
    }
  }
  const result = await playerService.addClubInterest(playerId, body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Interest recorded successfully through authorized platform communication process',
    data: result,
  });
});

export const getAllPlayerProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.getAllProfiles(req.query, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player profiles fetched successfully',
    meta: result.meta,
    data: result.result,
  });
});

export const updatePlayerProfile = catchAsync(async (req: Request, res: Response) => {
  let payload = { ...req.body };
  if (req.body.data) {
    try {
      const parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      payload = { ...parsed, ...payload };
      delete payload.data;
    } catch {
      // ignore
    }
  }

  const clubLogosByIndex: Record<number, string> = {};
  const clubLogosList: string[] = [];

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'profileImage' || file.fieldname === 'avatar') {
        payload.profileImage = await uploadToStorage(file, 'player_profiles');
      } else if (file.fieldname === 'highlightVideo' || file.fieldname === 'video') {
        payload.highlightVideo = await uploadToStorage(file, 'player_videos');
      } else if (
        file.fieldname === 'clubLogo' ||
        file.fieldname === 'clubImage' ||
        file.fieldname === 'logo' ||
        file.fieldname === 'crest'
      ) {
        payload.clubLogo = await uploadToStorage(file, 'club_crests');
      } else {
        const match =
          file.fieldname.match(/clubLogo_?(\d+)/i) || file.fieldname.match(/clubLogo\[(\d+)\]/i);
        if (match) {
          const idx = parseInt(match[1], 10);
          const uploadedUrl = await uploadToStorage(file, 'club_crests');
          clubLogosByIndex[idx] = uploadedUrl;
        } else if (file.fieldname === 'clubLogos') {
          const uploadedUrl = await uploadToStorage(file, 'club_crests');
          clubLogosList.push(uploadedUrl);
        }
      }
    }
  }

  if (Object.keys(clubLogosByIndex).length > 0) {
    payload.clubLogosByIndex = clubLogosByIndex;
  }
  if (clubLogosList.length > 0) {
    payload.clubLogosList = clubLogosList;
  }

  if (req.file) {
    if (
      req.file.fieldname === 'clubLogo' ||
      req.file.fieldname === 'clubImage' ||
      req.file.fieldname === 'logo' ||
      req.file.fieldname === 'crest'
    ) {
      payload.clubLogo = await uploadToStorage(req.file, 'club_crests');
    } else if (req.file.fieldname === 'profileImage' || req.file.fieldname === 'avatar') {
      payload.profileImage = await uploadToStorage(req.file, 'player_profiles');
    } else if (req.file.fieldname === 'highlightVideo' || req.file.fieldname === 'video') {
      payload.highlightVideo = await uploadToStorage(req.file, 'player_videos');
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

  const result = await playerService.updateProfile(targetId, payload, req.user);
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
  let clubHistory = req.body.clubHistory;
  if (req.body?.data) {
    try {
      const parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      if (parsed.clubHistory) clubHistory = parsed.clubHistory;
      else if (Array.isArray(parsed)) clubHistory = parsed;
    } catch {
      // ignore
    }
  }
  if (typeof clubHistory === 'string') {
    try {
      clubHistory = JSON.parse(clubHistory);
    } catch {
      // ignore
    }
  }
  const result = await playerService.updateClubHistory(playerId, clubHistory);
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

  const payload: any = { ...req.body };
  delete payload.data;

  if (req.body?.data) {
    let parsedData: any = {};
    if (typeof req.body.data === 'string') {
      try {
        parsedData = JSON.parse(req.body.data);
      } catch {
        try {
          const cleaned = req.body.data.replace(/,\s*([}\]])/g, '$1');
          parsedData = JSON.parse(cleaned);
        } catch {
          throw new AppError(400, "Invalid JSON format in 'data' field");
        }
      }
    } else if (typeof req.body.data === 'object' && req.body.data !== null) {
      parsedData = req.body.data;
    }

    if (parsedData && typeof parsedData === 'object') {
      Object.keys(parsedData).forEach((key) => {
        if (parsedData[key] !== undefined && parsedData[key] !== '') {
          payload[key] = parsedData[key];
        }
      });
    }
  }

  if (req.file) {
    payload.logoUrl = await uploadToStorage(req.file, 'club_crests');
  }

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (
        file.fieldname === 'logo' ||
        file.fieldname === 'logoUrl' ||
        file.fieldname === 'image' ||
        file.fieldname === 'file'
      ) {
        payload.logoUrl = await uploadToStorage(file, 'club_crests');
      }
    }
  }

  const clubName = payload.clubName || payload.name || payload.club;
  let period = payload.period || payload.years || payload.duration;

  if (!period && (payload.from || payload.to || payload.fromYear || payload.toYear)) {
    const fromVal = payload.from || payload.fromYear || '';
    const toVal = payload.to || payload.toYear || 'Present';
    if (fromVal) {
      period = `${fromVal} - ${toVal}`;
    }
  }

  let isCurrent = payload.isCurrent;
  if (typeof isCurrent === 'string') {
    isCurrent = isCurrent.toLowerCase() === 'true';
  } else if (isCurrent === undefined && typeof period === 'string') {
    isCurrent = period.toLowerCase().includes('present');
  }

  payload.clubName = clubName;
  payload.from = payload.from || payload.fromYear || undefined;
  payload.to = payload.to || payload.toYear || undefined;
  payload.period = period;
  payload.isCurrent = Boolean(isCurrent);

  if (!payload.clubName) {
    throw new AppError(400, 'Club name is required');
  }
  if (!payload.period) {
    throw new AppError(400, 'Period is required (e.g. 2020 - Present, or from/to)');
  }

  const result = await playerService.addClubHistoryItem(playerId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Club added to history successfully',
    data: result,
  });
});

export const deleteClubHistoryItem = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const clubId = req.params.clubId || req.params.id;
  if (!clubId) {
    throw new AppError(400, 'Club ID or name is required');
  }

  const result = await playerService.deleteClubHistoryItem(playerId, clubId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club removed from history successfully',
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

export const uploadPlayerDocuments = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  let filesToUpload: Express.Multer.File[] = [];
  if (req.files && Array.isArray(req.files)) {
    filesToUpload = req.files as Express.Multer.File[];
  } else if (req.file) {
    filesToUpload = [req.file];
  }

  if (filesToUpload.length === 0) {
    throw new AppError(400, 'No document file provided for upload');
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

  const result = await playerService.uploadDocuments(playerId, filesToUpload, title);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Document uploaded successfully',
    data: result,
  });
});

export const deletePlayerDocument = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const documentId = req.params.documentId || req.params.id;
  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const result = await playerService.deleteDocument(playerId, documentId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Document deleted successfully',
    data: result,
  });
});

export const getPlayerDocuments = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const result = await playerService.getDocuments(playerId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents fetched successfully',
    data: result,
  });
});

export const updatePlayerDocument = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const documentId = req.params.documentId || req.params.id;
  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
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

  const file = req.file || (req.files && Array.isArray(req.files) ? req.files[0] : undefined);

  const result = await playerService.updateDocument(
    playerId,
    documentId,
    { title },
    file as Express.Multer.File | undefined,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Document updated successfully',
    data: result,
  });
});

export const getPlayerAnalytics = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required or authenticate as a player');
  }

  const result = await playerService.getPlayerAnalytics(playerId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player analytics fetched successfully',
    data: result,
  });
});

export const updatePlayerPotential = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const result = await playerService.updateFullPotential(playerId, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Full potential updated successfully',
    data: result,
  });
});

export const updatePlayerMental = catchAsync(async (req: Request, res: Response) => {
  const playerId = resolvePlayerId(req);
  if (!playerId) {
    throw new AppError(400, 'Player ID is required');
  }

  const result = await playerService.updateMentalAnalysis(playerId, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Mental analysis updated successfully',
    data: result,
  });
});

export const getMyPlayerEvaluations = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await playerService.getMyEvaluations(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluations fetched successfully',
    data: result,
  });
});
