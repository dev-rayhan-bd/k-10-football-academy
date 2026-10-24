import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { agentService } from './agent.service';

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
    req.params.agentId === 'me'
      ? (req as any).user.userId || (req as any).user.id
      : req.params.agentId;

  const file =
    req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined);

  if (file) {
    req.body.fileUrl = await uploadToStorage(file, 'agent_verification_docs');
  }

  const result = await agentService.uploadVerificationDocument(targetId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Verification document uploaded successfully',
    data: result,
  });
});

export const getVerificationDocs = catchAsync(async (req: Request, res: Response) => {
  const targetId =
    req.params.agentId === 'me'
      ? (req as any).user.userId || (req as any).user.id
      : req.params.agentId;

  const result = await agentService.getVerificationDocuments(targetId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification documents fetched successfully',
    data: result,
  });
});

export const createSuccessStory = catchAsync(async (req: Request, res: Response) => {
  const result = await agentService.createSuccessStory(
    (req as any).user?.id || req.body.creatorId,
    req.body,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Success story created successfully',
    data: result,
  });
});

export const getSuccessStories = catchAsync(async (req: Request, res: Response) => {
  const result = await agentService.getSuccessStories(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Success stories fetched successfully',
    data: result,
  });
});
