import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { coachService } from './coach.service';
import { uploadToStorage } from '@/utils/fileUpload.utils';

// Helper to extract uploaded file by field name
const extractFile = (req: Request, fieldName: string): Express.Multer.File | undefined => {
  if (req.file && req.file.fieldname === fieldName) return req.file;
  if (Array.isArray(req.files)) {
    return req.files.find((f) => f.fieldname === fieldName);
  }
  return req.file;
};

// ==========================================
// MASTER CV CONTROLLER (SINGLE UNIFIED RESPONSE)
// ==========================================
export const getMyCoachCV = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getMyCV(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach CV fetched successfully',
    data: result,
  });
});

export const getCoachCV = catchAsync(async (req: Request, res: Response) => {
  const viewer = (req as any).user;
  const result = await coachService.getCoachCV(req.params.id, viewer);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach CV fetched successfully',
    data: result,
  });
});

// ==========================================
// UNIFIED PROFILE & CV UPDATE (SINGLE PATCH API)
// ==========================================
export const updateMyCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  let payload: any = { ...req.body };

  // Parse if nested inside multipart form-data 'data' field
  if (payload.data && typeof payload.data === 'string') {
    try {
      const parsed = JSON.parse(payload.data);
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
        payload.profileImage = await uploadToStorage(file, 'coach_profiles');
      } else if (file.fieldname === 'coverImage' || file.fieldname === 'banner') {
        payload.coverImage = await uploadToStorage(file, 'coach_covers');
      } else if (
        file.fieldname === 'clubLogo' ||
        file.fieldname === 'clubImage' ||
        file.fieldname === 'logo'
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
    if (req.file.fieldname === 'profileImage' || req.file.fieldname === 'avatar') {
      payload.profileImage = await uploadToStorage(req.file, 'coach_profiles');
    } else if (req.file.fieldname === 'coverImage' || req.file.fieldname === 'banner') {
      payload.coverImage = await uploadToStorage(req.file, 'coach_covers');
    } else if (
      req.file.fieldname === 'clubLogo' ||
      req.file.fieldname === 'clubImage' ||
      req.file.fieldname === 'logo'
    ) {
      payload.clubLogo = await uploadToStorage(req.file, 'club_crests');
    }
  }

  const result = await coachService.updateMyProfile(userId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach CV updated successfully',
    data: result,
  });
});

export const updateCoachProfile = catchAsync(async (req: Request, res: Response) => {
  let payload: any = { ...req.body };

  if (payload.data && typeof payload.data === 'string') {
    try {
      const parsed = JSON.parse(payload.data);
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
        payload.profileImage = await uploadToStorage(file, 'coach_profiles');
      } else if (file.fieldname === 'coverImage' || file.fieldname === 'banner') {
        payload.coverImage = await uploadToStorage(file, 'coach_covers');
      } else if (
        file.fieldname === 'clubLogo' ||
        file.fieldname === 'clubImage' ||
        file.fieldname === 'logo'
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
    if (req.file.fieldname === 'profileImage' || req.file.fieldname === 'avatar') {
      payload.profileImage = await uploadToStorage(req.file, 'coach_profiles');
    } else if (req.file.fieldname === 'coverImage' || req.file.fieldname === 'banner') {
      payload.coverImage = await uploadToStorage(req.file, 'coach_covers');
    } else if (
      req.file.fieldname === 'clubLogo' ||
      req.file.fieldname === 'clubImage' ||
      req.file.fieldname === 'logo'
    ) {
      payload.clubLogo = await uploadToStorage(req.file, 'club_crests');
    }
  }

  const result = await coachService.updateProfile(req.params.id, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profile updated successfully',
    data: result,
  });
});

export const requestRevalidation = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.requestRevalidation(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

// ==========================================
// SPECIFIC ITEM DELETES (CLUB)
// ==========================================
export const deleteMyClub = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const clubId = req.params.clubId;
  const result = await coachService.deleteClub(userId, clubId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Club removed successfully',
    data: result,
  });
});

// ==========================================
// CERTIFICATES & DOCUMENTS (DEDICATED CRUD)
// ==========================================
export const getMyDocuments = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getDocuments(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents fetched successfully',
    data: result,
  });
});

export const uploadMyDocument = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const payload: any = { ...req.body };

  const docFile =
    extractFile(req, 'file') ||
    extractFile(req, 'document') ||
    extractFile(req, 'certificate') ||
    req.file;

  if (docFile) {
    payload.fileUrl = await uploadToStorage(docFile, 'coach_documents');
    if (!payload.fileType) payload.fileType = docFile.mimetype;
    if (!payload.title) payload.title = docFile.originalname;
  }

  const result = await coachService.addDocument(userId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Document uploaded successfully',
    data: result,
  });
});

export const deleteMyDocument = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const docId = req.params.docId;
  const result = await coachService.deleteDocument(userId, docId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Document removed successfully',
    data: result,
  });
});

// ==========================================
// TESTIMONIALS (DEDICATED CRUD)
// ==========================================
export const getMyTestimonials = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getTestimonials(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Testimonials fetched successfully',
    data: result,
  });
});

export const addMyTestimonial = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  let payload: any = { ...req.body };

  if (payload.data && typeof payload.data === 'string') {
    try {
      const parsed = JSON.parse(payload.data);
      payload = { ...parsed, ...payload };
      delete payload.data;
    } catch {
      // ignore
    }
  }

  const avatarFile = extractFile(req, 'authorAvatar') || extractFile(req, 'avatar') || req.file;
  if (avatarFile) {
    payload.authorAvatar = await uploadToStorage(avatarFile, 'coach_testimonials');
  }

  const result = await coachService.addTestimonial(userId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Testimonial added successfully',
    data: result,
  });
});

export const updateMyTestimonial = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const testimonialId = req.params.testimonialId;
  let payload: any = { ...req.body };

  if (payload.data && typeof payload.data === 'string') {
    try {
      const parsed = JSON.parse(payload.data);
      payload = { ...parsed, ...payload };
      delete payload.data;
    } catch {
      // ignore
    }
  }

  const avatarFile = extractFile(req, 'authorAvatar') || extractFile(req, 'avatar') || req.file;
  if (avatarFile) {
    payload.authorAvatar = await uploadToStorage(avatarFile, 'coach_testimonials');
  }

  const result = await coachService.updateTestimonial(userId, testimonialId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Testimonial updated successfully',
    data: result,
  });
});

export const deleteMyTestimonial = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const testimonialId = req.params.testimonialId;
  const result = await coachService.deleteTestimonial(userId, testimonialId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Testimonial deleted successfully',
    data: result,
  });
});

export const getTestimonials = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getTestimonials(req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Testimonials fetched successfully',
    data: result,
  });
});

export const addTestimonial = catchAsync(async (req: Request, res: Response) => {
  const payload = { ...req.body };
  const avatarFile = extractFile(req, 'authorAvatar') || extractFile(req, 'avatar') || req.file;
  if (avatarFile) {
    payload.authorAvatar = await uploadToStorage(avatarFile, 'coach_testimonials');
  }

  const result = await coachService.addTestimonial(req.params.coachId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Testimonial added successfully',
    data: result,
  });
});

// ==========================================
// BASE & BACKWARD COMPATIBILITY
// ==========================================
export const createCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Coach profile created successfully',
    data: result,
  });
});

export const getMyCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getMyProfile((req as any).user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My coach profile fetched successfully',
    data: result,
  });
});

export const getCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profile fetched successfully',
    data: result,
  });
});

export const getAllCoachProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profiles fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

export const getTacticalFormations = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getTacticalFormations(req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tactical formations fetched successfully',
    data: result,
  });
});

export const saveTacticalFormation = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.saveTacticalFormation(req.params.coachId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tactical formation saved successfully',
    data: result,
  });
});

export const validatePlayerCV = catchAsync(async (req: Request, res: Response) => {
  const coachUserId = (req as any).user.userId;
  const playerId = req.params.playerId || req.body.playerId;
  const result = await coachService.validatePlayerCV(coachUserId, playerId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player CV validated successfully',
    data: result,
  });
});

export const getMyCoachAnalytics = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getCoachAnalytics(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach analytics retrieved successfully',
    data: result,
  });
});

export const getCoachAnalytics = catchAsync(async (req: Request, res: Response) => {
  const coachId = req.params.id || req.params.coachId;
  const result = await coachService.getCoachAnalytics(coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach analytics retrieved successfully',
    data: result,
  });
});

export const getMyTeamsSquad = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getMyTeamsSquad(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My teams squad fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

export const updatePlayerFitnessStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { playerId } = req.params;
  const { status } = req.body;
  const result = await coachService.updatePlayerFitnessStatus(userId, playerId, status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player fitness status updated successfully',
    data: result,
  });
});

export const getPlayerCvValidationsDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getPlayerCvValidationsDashboard(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player CV validations dashboard fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

export const getPlayerEvaluationsDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await coachService.getPlayerEvaluationsDashboard(userId, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluations fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

export const getPlayerEvaluationDetails = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { id } = req.params;
  const result = await coachService.getPlayerEvaluationDetails(userId, id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluation details fetched successfully',
    data: result,
  });
});

export const submitPlayerEvaluation = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { id } = req.params;
  const result = await coachService.submitPlayerEvaluation(userId, id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Player evaluation submitted successfully',
    data: result,
  });
});
