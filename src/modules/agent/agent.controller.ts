import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { agentService } from './agent.service';

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
  const result = await agentService.uploadVerificationDocument(req.params.agentId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Verification document uploaded successfully',
    data: result,
  });
});

export const getVerificationDocs = catchAsync(async (req: Request, res: Response) => {
  const result = await agentService.getVerificationDocuments(req.params.agentId);
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
