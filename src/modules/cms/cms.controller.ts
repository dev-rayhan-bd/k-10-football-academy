import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { cmsService, CmsService } from './cms.service';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';

export class CmsController {
  constructor(private readonly service: CmsService = cmsService) {}

  /**
   * Public: Get all current active legal policies
   */
  getAllActivePolicies = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const policies = await this.service.getAllActivePolicies();
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Active legal policies retrieved successfully',
      data: policies,
    });
  });

  /**
   * Public: Get single policy by type or slug (always updated by default, or ?version=... if specified)
   */
  getActivePolicy = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const version = (req.query.version as string) || (req.params.version as string);
    const policy = version
      ? await this.service.getPolicyVersion(req.params.type, version)
      : await this.service.getActivePolicy(req.params.type);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: version
        ? `Policy version ${version} retrieved successfully`
        : 'Policy document retrieved successfully',
      data: policy,
    });
  });

  /**
   * Public: Get specific version of a policy
   */
  getPolicyVersion = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { type, version } = req.params;
    const policy = await this.service.getPolicyVersion(type, version);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: `Policy version ${version} retrieved successfully`,
      data: policy,
    });
  });

  /**
   * Admin: List all policy documents with filtering & pagination
   */
  adminGetAllPolicies = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.adminGetAllPolicies(req.query);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Admin policy documents retrieved successfully',
      meta: result.meta,
      data: result.data,
    });
  });

  /**
   * Admin: Get policy document by Type (or ID), with optional ?version= query param
   * - By default: Always returns the latest updated version.
   * - If ?version= is passed: Returns that specific version.
   */
  adminGetPolicy = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const typeOrId = req.params.type || req.params.id;
    const version = (req.query.version as string) || (req.params.version as string);
    const policy = await this.service.adminGetPolicy(typeOrId, version);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: version
        ? `Policy version ${version} retrieved successfully`
        : 'Active policy document retrieved successfully',
      data: policy,
    });
  });

  /**
   * Admin: Single Canonical Endpoint to Save / Publish Policy
   * - isMajorUpdate === false: In-place update for typo/minor edits (No new version).
   * - isMajorUpdate === true: New major version release (1.0 -> 2.0).
   */
  adminSavePolicy = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const adminId = req.user!.userId;
    const { policy, isNewVersion, message } = await this.service.adminSavePolicy(adminId, req.body);
    sendResponse(res, {
      statusCode: isNewVersion ? StatusCodes.CREATED : StatusCodes.OK,
      success: true,
      message,
      data: policy,
    });
  });

  /**
   * Admin: Delete policy document (Draft / Non-current only)
   */
  adminDeletePolicy = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.adminDeletePolicy(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result,
    });
  });
}

export const cmsController = new CmsController();
