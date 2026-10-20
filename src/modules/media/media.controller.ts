import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { mediaService } from './media.service';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { AppError } from '@/utils/AppError';
import { IJwtPayload } from '@/middlewares/auth.middleware';

export const uploadMedia = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IJwtPayload;
  if (!user || !user.userId) {
    throw new AppError(401, 'Authentication token missing or invalid');
  }

  let mediaUrl = req.body.url || '';
  let thumbnailUrl = req.body.thumbnailUrl || '';
  let title = req.body.title || 'Untitled Media';
  let description = req.body.description || '';
  let mediaType: 'IMAGE' | 'VIDEO' = req.body.mediaType || 'IMAGE';
  let isPublic = req.body.isPublic !== undefined ? Boolean(req.body.isPublic) : true;
  let tags = Array.isArray(req.body.tags) ? req.body.tags : undefined;

  // Support JSON payload inside multipart form 'data' field
  if (req.body.data) {
    try {
      const parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      if (parsed.title) title = parsed.title;
      if (parsed.description) description = parsed.description;
      if (parsed.url && !mediaUrl) mediaUrl = parsed.url;
      if (parsed.thumbnailUrl && !thumbnailUrl) thumbnailUrl = parsed.thumbnailUrl;
      if (parsed.mediaType) mediaType = parsed.mediaType;
      if (parsed.isPublic !== undefined) isPublic = Boolean(parsed.isPublic);
      if (parsed.tags) tags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags];
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Handle uploaded files via Multer
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'thumbnail') {
        thumbnailUrl = await uploadToStorage(file, 'media_thumbnails');
      } else if (file.mimetype.startsWith('video/') || file.fieldname === 'video') {
        mediaUrl = await uploadToStorage(file, 'media_videos');
        mediaType = 'VIDEO';
      } else if (
        file.mimetype.startsWith('image/') ||
        file.fieldname === 'image' ||
        file.fieldname === 'photo'
      ) {
        mediaUrl = await uploadToStorage(file, 'media_images');
        mediaType = 'IMAGE';
      } else if (file.fieldname === 'file') {
        if (file.mimetype.startsWith('video/')) {
          mediaUrl = await uploadToStorage(file, 'media_videos');
          mediaType = 'VIDEO';
        } else {
          mediaUrl = await uploadToStorage(file, 'media_images');
          mediaType = 'IMAGE';
        }
      }
    }
  } else if (req.file) {
    const file = req.file as Express.Multer.File;
    if (file.mimetype.startsWith('video/')) {
      mediaUrl = await uploadToStorage(file, 'media_videos');
      mediaType = 'VIDEO';
    } else {
      mediaUrl = await uploadToStorage(file, 'media_images');
      mediaType = 'IMAGE';
    }
  }

  if (!mediaUrl) {
    throw new AppError(400, 'Please upload a file or provide a valid media URL');
  }

  // Detect mediaType if URL ends with video extension or Cloudinary video path
  if (
    mediaUrl.includes('/video/upload/') ||
    mediaUrl.match(/\.(mp4|mov|avi|webm|mkv)$/i) !== null
  ) {
    mediaType = 'VIDEO';
  }

  const result = await mediaService.uploadMedia(user, {
    url: mediaUrl,
    thumbnailUrl,
    title,
    description,
    mediaType,
    isPublic,
    tags,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Media uploaded successfully',
    data: result,
  });
});

export const getMyMedia = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IJwtPayload;
  if (!user || !user.userId) {
    throw new AppError(401, 'Authentication token missing or invalid');
  }

  const result = await mediaService.getMyMedia(user.userId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Media gallery fetched successfully',
    data: result,
  });
});

export const getUserMedia = catchAsync(async (req: Request, res: Response) => {
  const targetId = req.params.userId || req.params.id;
  if (!targetId) {
    throw new AppError(400, 'User ID is required');
  }

  const result = await mediaService.getUserMedia(targetId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User media gallery fetched successfully',
    data: result,
  });
});

export const updateMedia = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IJwtPayload;
  const mediaId = req.params.id;

  const updatePayload: any = { ...req.body };

  // Parse JSON from multipart 'data' field if sent via form-data
  if (req.body.data) {
    try {
      const parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      if (parsed.title !== undefined) updatePayload.title = parsed.title;
      if (parsed.description !== undefined) updatePayload.description = parsed.description;
      if (parsed.isPublic !== undefined) updatePayload.isPublic = Boolean(parsed.isPublic);
      if (parsed.tags !== undefined) {
        updatePayload.tags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags];
      }
      if (parsed.mediaType !== undefined) updatePayload.mediaType = parsed.mediaType;
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Handle uploaded files if updating video, image, or thumbnail
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (file.fieldname === 'thumbnail') {
        updatePayload.thumbnailUrl = await uploadToStorage(file, 'media_thumbnails');
      } else if (file.mimetype.startsWith('video/') || file.fieldname === 'video') {
        updatePayload.url = await uploadToStorage(file, 'media_videos');
        updatePayload.mediaType = 'VIDEO';
      } else if (
        file.mimetype.startsWith('image/') ||
        file.fieldname === 'image' ||
        file.fieldname === 'photo'
      ) {
        updatePayload.url = await uploadToStorage(file, 'media_images');
        updatePayload.mediaType = 'IMAGE';
      } else if (file.fieldname === 'file') {
        if (file.mimetype.startsWith('video/')) {
          updatePayload.url = await uploadToStorage(file, 'media_videos');
          updatePayload.mediaType = 'VIDEO';
        } else {
          updatePayload.url = await uploadToStorage(file, 'media_images');
          updatePayload.mediaType = 'IMAGE';
        }
      }
    }
  } else if (req.file) {
    const file = req.file as Express.Multer.File;
    if (file.mimetype.startsWith('video/')) {
      updatePayload.url = await uploadToStorage(file, 'media_videos');
      updatePayload.mediaType = 'VIDEO';
    } else {
      updatePayload.url = await uploadToStorage(file, 'media_images');
      updatePayload.mediaType = 'IMAGE';
    }
  }

  const result = await mediaService.updateMedia(mediaId, user.userId, user.role, updatePayload);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Media updated successfully',
    data: result,
  });
});

export const deleteMedia = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IJwtPayload;
  const mediaId = req.params.id;

  const result = await mediaService.deleteMedia(mediaId, user.userId, user.role);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});
