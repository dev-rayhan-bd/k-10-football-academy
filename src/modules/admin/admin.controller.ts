/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { adminService } from './admin.service';

export class AdminController {
  getPlayers = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getPlayers(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin players list fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getCoaches = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getCoaches(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin coaches list fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getAcademies = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getAcademies(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin academies list fetched successfully',
      meta: {
        ...result.meta,
        summary: result.summary,
      } as any,
      data: result.data,
    });
  });

  getAgents = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getAgents(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin agents list fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getClubs = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getClubs(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin clubs list fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getUserDetails = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getUserDetailsById(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User details retrieved successfully',
      data: result,
    });
  });

  updateUserStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.updateUserStatus(
      req.params.id,
      req.body || {},
      req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result,
    });
  });

  deleteUser = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.deleteUserAndProfile(
      req.params.id,
      req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User and associated profile deleted successfully',
      data: result,
    });
  });

  // ==========================================
  // MEMBERSHIP PLANS
  // ==========================================

  getMembershipPlans = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getMembershipPlans(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Membership plans fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  createMembershipPlan = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.createMembershipPlan(req.body);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'Membership plan created successfully',
      data: result,
    });
  });

  updateMembershipPlan = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.updateMembershipPlan(req.params.id, req.body);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Membership plan updated successfully',
      data: result,
    });
  });

  deleteMembershipPlan = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.deleteMembershipPlan(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Membership plan deleted successfully',
      data: result,
    });
  });

  // ==========================================
  // GRANT MEMBERSHIP
  // ==========================================

  getMembershipGrants = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getMembershipGrants(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Membership grants fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  grantMembership = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.grantMembership(req.body, req.user?.userId);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'Premium membership granted successfully',
      data: result,
    });
  });

  revokeMembershipGrant = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.revokeMembershipGrant(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Membership grant revoked successfully',
      data: result,
    });
  });

  // ==========================================
  // APPROVALS & VERIFICATIONS (Agents & Clubs)
  // ==========================================

  getApprovals = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getApprovals(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Approval applications fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getApprovalDetails = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getApprovalDetailsById(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Approval application details fetched successfully',
      data: result,
    });
  });

  decideApproval = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.decideApproval(req.params.id, req.body);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result,
    });
  });

  // ==========================================
  // SUCCESS STORIES (Academies, Agents, Clubs)
  // ==========================================

  getSuccessStories = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getSuccessStories(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Success stories fetched successfully',
      meta: result.meta as any,
      data: result.data,
    });
  });

  getSuccessStoryDetails = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getSuccessStoryById(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Success story details fetched successfully',
      data: result,
    });
  });

  decideSuccessStory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.decideSuccessStory(req.params.id, req.body);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result,
    });
  });

  // ==========================================
  // PAYMENTS, REVENUE, COMMISSIONS & SPEND
  // ==========================================

  getPayments = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getPayments(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin platform payments and revenue summary fetched successfully',
      meta: {
        ...result.meta,
        summary: result.summary,
      } as any,
      data: result.data,
    });
  });

  getPaymentDetails = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getPaymentById(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Payment details retrieved successfully',
      data: result,
    });
  });

  createPayment = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.createPayment(req.body, req.user?.userId);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'Payment record created successfully',
      data: result,
    });
  });

  updatePayment = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.updatePayment(req.params.id, req.body, req.user?.userId);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Payment record updated successfully',
      data: result,
    });
  });

  // ==========================================
  // ANALYTICS (User Growth, Role Distribution & Revenue Breakdown)
  // ==========================================

  getAnalytics = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getAnalytics(req.query as any);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin platform analytics fetched successfully',
      data: result,
    });
  });
}

export const adminController = new AdminController();
