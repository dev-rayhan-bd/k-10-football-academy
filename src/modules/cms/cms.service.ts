import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { LegalPolicy } from './cms.model';
import { ILegalPolicy, PolicyType } from './cms.interface';

// Normalize slug or route param to standard DB PolicyType
export const normalizePolicyType = (typeOrSlug: string): PolicyType => {
  const clean = String(typeOrSlug).trim().toUpperCase().replace(/-/g, '_');
  if (clean === 'TERMS' || clean === 'TERMS_AND_CONDITIONS' || clean === 'TERMS_CONDITIONS') {
    return 'TERMS_AND_CONDITIONS';
  }
  if (clean === 'PRIVACY' || clean === 'PRIVACY_POLICY') {
    return 'PRIVACY_POLICY';
  }
  if (clean === 'MEDIA' || clean === 'MEDIA_CONSENT') {
    return 'MEDIA_CONSENT';
  }
  if (clean === 'COOKIE' || clean === 'COOKIE_POLICY') {
    return 'COOKIE_POLICY';
  }
  return clean;
};

// Generate URL slug from title/type
export const generateSlug = (type: string, title?: string): string => {
  if (title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  return type.toLowerCase().replace(/_/g, '-');
};

export class CmsService {
  /**
   * Helper: Get current active version string for a policy type (used across the entire system)
   */
  async getLatestActiveVersion(type: PolicyType = 'TERMS_AND_CONDITIONS'): Promise<string> {
    const active = await LegalPolicy.findOne({
      type: normalizePolicyType(type),
      isCurrent: true,
      isPublished: true,
    }).select('version');

    return active?.version || '1.0';
  }

  /**
   * Public: Get single current active policy by type or slug
   */
  async getActivePolicy(typeOrSlug: string) {
    const normalizedType = normalizePolicyType(typeOrSlug);
    const policy = await LegalPolicy.findOne({
      $or: [{ type: normalizedType }, { slug: typeOrSlug.toLowerCase().trim() }],
      isCurrent: true,
      isPublished: true,
    })
      .populate('updatedBy', 'name email')
      .lean();

    if (!policy) {
      throw new AppError(StatusCodes.NOT_FOUND, `Active policy for ${normalizedType} not found`);
    }

    return policy;
  }

  /**
   * Public: Get list of all currently active policies (Terms, Privacy, Media, etc.)
   */
  async getAllActivePolicies() {
    const policies = await LegalPolicy.find({
      isCurrent: true,
      isPublished: true,
    })
      .select('type title slug version effectiveDate summaryOfChanges updatedAt')
      .sort({ type: 1 })
      .lean();

    return policies;
  }

  /**
   * Public: Get specific version history of a policy
   */
  async getPolicyVersion(typeOrSlug: string, version: string) {
    const normalizedType = normalizePolicyType(typeOrSlug);
    const policy = await LegalPolicy.findOne({
      type: normalizedType,
      version: String(version).trim(),
      isPublished: true,
    }).lean();

    if (!policy) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        `Policy ${normalizedType} version ${version} not found`,
      );
    }

    return policy;
  }

  /**
   * Admin: Get all policies (including historical versions, drafts) with filtering & pagination
   */
  async adminGetAllPolicies(query: Record<string, unknown> = {}) {
    const filter: Record<string, unknown> = {};

    if (query.type) {
      filter.type = normalizePolicyType(String(query.type));
    }
    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished === 'true' || query.isPublished === true;
    }
    if (query.isCurrent !== undefined) {
      filter.isCurrent = query.isCurrent === 'true' || query.isCurrent === true;
    }
    if (query.search) {
      const regex = new RegExp(String(query.search).trim(), 'i');
      filter.$or = [{ title: regex }, { version: regex }, { summaryOfChanges: regex }];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 20);
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      LegalPolicy.countDocuments(filter),
      LegalPolicy.find(filter)
        .populate('createdBy', 'name email role')
        .populate('updatedBy', 'name email role')
        .sort({ type: 1, isCurrent: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data,
    };
  }

  /**
   * Admin: Get policy by type (or ID), with optional version parameter.
   * - If no version specified: Always returns the latest active/updated version.
   * - If version specified (e.g. ?version=1.0): Returns that specific version.
   */
  async adminGetPolicy(typeOrId: string, version?: string) {
    if (Types.ObjectId.isValid(typeOrId) && !version) {
      const policyById = await LegalPolicy.findById(typeOrId)
        .populate('createdBy', 'name email role')
        .populate('updatedBy', 'name email role')
        .lean();
      if (policyById) return policyById;
    }

    const normalizedType = normalizePolicyType(typeOrId);

    if (version) {
      const policy = await LegalPolicy.findOne({
        type: normalizedType,
        version: String(version).trim(),
      })
        .populate('createdBy', 'name email role')
        .populate('updatedBy', 'name email role')
        .lean();

      if (!policy) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          `Policy ${normalizedType} version ${version} not found`,
        );
      }
      return policy;
    }

    // Default: Always return the latest active / updated version
    const activePolicy = await LegalPolicy.findOne({
      type: normalizedType,
      isCurrent: true,
    })
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .lean();

    if (!activePolicy) {
      throw new AppError(StatusCodes.NOT_FOUND, `Active policy for ${normalizedType} not found`);
    }

    return activePolicy;
  }

  /**
   * Admin: Single Canonical Endpoint to Save or Publish Policy
   * - isMajorUpdate === false (default): In-place updates the current active policy (Typo fix, spelling, minor edits). Version stays unchanged. Existing user acceptance remains valid.
   * - isMajorUpdate === true: Retires current active policy and creates a new major version (e.g. 1.0 -> 2.0). All platform users will dynamically require re-acceptance.
   */
  async adminSavePolicy(userId: string, payload: Partial<ILegalPolicy>) {
    const normalizedType = normalizePolicyType(payload.type || 'TERMS_AND_CONDITIONS');
    const isMajor = Boolean(payload.isMajorUpdate);

    // Find current active policy for this type
    const currentPolicy = await LegalPolicy.findOne({
      type: normalizedType,
      isCurrent: true,
    });

    // Case 1: Minor In-Place Update (Typo / spelling / content revision on existing active policy)
    if (!isMajor && currentPolicy) {
      if (payload.title) {
        currentPolicy.title = payload.title;
        currentPolicy.slug = generateSlug(normalizedType, payload.title);
      }
      if (payload.content !== undefined) {
        currentPolicy.content = payload.content;
      }
      if (payload.summaryOfChanges !== undefined) {
        currentPolicy.summaryOfChanges = payload.summaryOfChanges;
      }
      if (payload.effectiveDate) {
        currentPolicy.effectiveDate = new Date(payload.effectiveDate);
      }
      if (payload.isPublished !== undefined) {
        currentPolicy.isPublished = payload.isPublished;
      }
      currentPolicy.updatedBy = new Types.ObjectId(userId);
      await currentPolicy.save();

      return {
        policy: currentPolicy,
        isNewVersion: false,
        message: `Policy ${normalizedType} (v${currentPolicy.version}) updated in-place successfully. Existing user acceptance remains valid.`,
      };
    }

    // Case 2: Major Policy Update (Increment Version e.g. 1.0 -> 2.0) or Initial Creation
    let targetVersion = payload.version?.trim();
    if (!targetVersion) {
      if (currentPolicy) {
        const parts = currentPolicy.version.split('.').map((p) => parseInt(p, 10) || 0);
        const major = parts[0] || 1;
        targetVersion = `${major + 1}.0`;
      } else {
        const latestPolicy = await LegalPolicy.findOne({ type: normalizedType })
          .sort({ createdAt: -1 })
          .select('version');
        const prevVer = latestPolicy?.version || '1.0';
        const parts = prevVer.split('.').map((p) => parseInt(p, 10) || 0);
        const major = parts[0] || 1;
        targetVersion = `${major + 1}.0`;
      }
    }

    // Check if this version number already exists
    const existingVer = await LegalPolicy.findOne({ type: normalizedType, version: targetVersion });
    if (existingVer) {
      throw new AppError(
        StatusCodes.CONFLICT,
        `Version ${targetVersion} for policy ${normalizedType} already exists.`,
      );
    }

    // Retire previous current versions
    await LegalPolicy.updateMany({ type: normalizedType }, { $set: { isCurrent: false } });

    const slug = generateSlug(normalizedType, payload.title || (currentPolicy?.title ?? ''));

    const newPolicy = await LegalPolicy.create({
      type: normalizedType,
      title: payload.title || currentPolicy?.title || `${normalizedType.replace(/_/g, ' ')}`,
      slug,
      content: payload.content,
      version: targetVersion,
      isMajorUpdate: isMajor,
      isCurrent: true,
      isPublished: payload.isPublished !== false,
      effectiveDate: payload.effectiveDate ? new Date(payload.effectiveDate) : new Date(),
      summaryOfChanges:
        payload.summaryOfChanges || (isMajor ? 'Major policy revision' : 'Initial version'),
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    });

    return {
      policy: newPolicy,
      isNewVersion: true,
      message: `New policy version ${targetVersion} published successfully. All users will be prompted to re-accept.`,
    };
  }

  /**
   * Admin: Delete policy document (Draft / Non-current only)
   */
  async adminDeletePolicy(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid policy ID format');
    }

    const policy = await LegalPolicy.findById(id);
    if (!policy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Policy document not found');
    }

    if (policy.isCurrent && policy.isPublished) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Cannot delete the active published legal policy. To remove, activate another version first.',
      );
    }

    await LegalPolicy.findByIdAndDelete(id);
    return { success: true, message: `Policy version ${policy.version} deleted successfully` };
  }
}

export const cmsService = new CmsService();
