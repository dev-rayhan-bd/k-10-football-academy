import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { AppError } from '@/utils/AppError';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { parentService } from './parent.service';

export const switchProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.switchProfile(req.user!.userId, req.body.childUserId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile switched to child successfully',
    data: result,
  });
});

export const switchToParent = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.switchToParent(
    req.user!.userId,
    req.body?.parentId,
    (req.user as any)?.parentUserId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile switched back to parent successfully',
    data: result,
  });
});

export const createParentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Parent profile created successfully',
    data: result,
  });
});

export const getParentProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parent profile fetched successfully',
    data: result,
  });
});

export const getAllParents = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getAllParents(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parents fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

export const linkChild = catchAsync(async (req: Request, res: Response) => {
  const parentId = (req as any).user?.userId || req.params.parentId;
  const result = await parentService.linkChild(parentId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Child linked successfully',
    data: result,
  });
});

export const createChild = catchAsync(async (req: Request, res: Response) => {
  const parentId = (req as any).user?.userId || req.params.parentId;
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
    payload.avatar = await uploadToStorage(req.file, 'avatars');
  }

  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files as Express.Multer.File[]) {
      if (
        file.fieldname === 'avatar' ||
        file.fieldname === 'profileImage' ||
        file.fieldname === 'image' ||
        file.fieldname === 'file'
      ) {
        payload.avatar = await uploadToStorage(file, 'avatars');
      }
    }
  }

  const result = await parentService.createChild(parentId, payload);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Child created and linked successfully',
    data: result,
  });
});

export const getMyChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getChildren((req as any).user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Linked children fetched successfully for dropdown',
    data: result,
  });
});

export const getChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await parentService.getChildren(req.params.parentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Children fetched successfully',
    data: result,
  });
});

export const createMatchReport = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const parentId = user?.userId || user?._id || user?.id || req.params.parentId;
  const result = await parentService.createMatchReport(parentId, req.body, user);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Parent match report created successfully',
    data: result,
  });
});

export const getMatchReports = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const parentId = user?.userId || user?._id || user?.id || req.params.parentId;
  const result = await parentService.getMatchReports(parentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Match reports fetched successfully',
    data: result,
  });
});

export const requestMatchReportReview = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const parentId = user?.userId || user?._id || user?.id || req.params.parentId;
  const { reportId } = req.params;
  const result = await parentService.requestMatchReportReview(parentId, reportId, req.body, user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Match report review requested successfully',
    data: result,
  });
});

export const verifyMatchReportPayment = catchAsync(async (req: Request, res: Response) => {
  const sessionId = (req.query.session_id || req.query.sessionId) as string | undefined;
  const reportId = (req.query.reportId || req.query.report_id) as string | undefined;
  const result = await parentService.verifyMatchReportPayment(sessionId, reportId);
  sendResponse(res, {
    statusCode: result.success ? 200 : 400,
    success: result.success,
    message: result.message,
    data: result.report || null,
  });
});

export const getChildTrainingSessions = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await parentService.getChildTrainingSessions(userId, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Child training sessions fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

export const submitParentRsvp = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const sessionId = req.params.sessionId || req.body.sessionId;
  const result = await parentService.submitParentRsvp(userId, sessionId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const getParentOverview = catchAsync(async (req: Request, res: Response) => {
  const userId = (req.user as any)?.userId || (req.user as any)?._id;
  const result = await parentService.getParentOverview(userId, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Parent overview dashboard fetched successfully',
    data: result,
  });
});
