/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { ClubProfile } from '@/modules/club/club.model';
import { MembershipPlan, UserSubscription } from '@/modules/subscription/subscription.model';
import { Notification } from '@/modules/notification/notification.model';
import { adminUserActionsService } from './admin-user-actions.service';
import {
  IAdminListQuery,
  isIgnoredFilter,
  parseFlexibleDate,
  formatDateYMD,
  inferTargetRole,
  parseDurationInput,
} from './admin.utils';

export class AdminMembershipService {
  private formatPlanDocument(plan: any) {
    const obj = typeof plan?.toObject === 'function' ? plan.toObject() : { ...plan };
    const planName = obj.planName || obj.title || '';
    const price = Number(obj.price) || 0;
    const currency = obj.currency || '$';
    const billingCycle = obj.billingCycle || 'MONTHLY';
    const isActive = obj.isActive !== undefined ? Boolean(obj.isActive) : true;

    return {
      _id: obj._id,
      planName,
      title: obj.title || planName,
      planCategory: obj.planCategory || obj.targetRole || 'PLAYER',
      targetRole: obj.targetRole || 'PLAYER',
      price,
      planPrice: price,
      currency,
      billingCycle,
      billingLabel: billingCycle === 'YEARLY' ? '/year' : '/month',
      features: Array.isArray(obj.features) ? obj.features : [],
      startDate: formatDateYMD(obj.startDate) || null,
      endDate: formatDateYMD(obj.endDate) || null,
      isActive,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      isDefaultPricing: Boolean(obj.isDefaultPricing),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  async getMembershipPlans(query: IAdminListQuery) {
    const filter: Record<string, any> = {};
    if (!isIgnoredFilter(query.status)) {
      const st = String(query.status).trim().toUpperCase();
      if (st === 'ACTIVE') filter.isActive = true;
      else if (st === 'INACTIVE') filter.isActive = false;
    }
    if (!isIgnoredFilter(query.targetRole || query.category)) {
      filter.targetRole = inferTargetRole(String(query.targetRole || query.category));
    }

    const plans = await MembershipPlan.find(filter).sort({ createdAt: 1 }).lean();
    let formatted = plans.map((p) => this.formatPlanDocument(p));

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
    if (search) {
      formatted = formatted.filter((p) =>
        [p.planName, p.planCategory, p.targetRole, ...(p.features || [])]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    return {
      meta: {
        total: formatted.length,
        activeCount: formatted.filter((p) => p.isActive).length,
        inactiveCount: formatted.filter((p) => !p.isActive).length,
      },
      data: formatted,
    };
  }

  async createMembershipPlan(payload: any) {
    const planName = String(payload.planName || payload.title || payload.name || '').trim();
    const rawPrice = Number(payload.price ?? payload.planPrice ?? 0);

    let features: string[] = [];
    if (Array.isArray(payload.features)) {
      features = payload.features.map((f: any) => String(f).trim()).filter(Boolean);
    } else if (typeof payload.features === 'string' && payload.features.trim()) {
      features = payload.features
        .split('\n')
        .map((f: string) => f.trim())
        .filter(Boolean);
    } else if (Array.isArray(payload.planCategory)) {
      features = payload.planCategory.map((f: any) => String(f).trim()).filter(Boolean);
    }

    const rawCategory =
      typeof payload.planCategory === 'string'
        ? payload.planCategory.trim()
        : payload.category || payload.targetRole || planName;

    const targetRole = inferTargetRole(payload.targetRole || rawCategory || planName);

    const isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : payload.active !== undefined
          ? Boolean(payload.active)
          : payload.status
            ? String(payload.status).toUpperCase() === 'ACTIVE'
            : true;

    const isDefaultPricing = Boolean(payload.isDefaultPricing ?? payload.defaultPricing ?? false);
    const startDate = parseFlexibleDate(payload.startDate);
    const endDate = parseFlexibleDate(payload.endDate);

    const created = await MembershipPlan.create({
      title: planName,
      planName,
      planCategory: rawCategory || targetRole,
      targetRole,
      price: rawPrice,
      currency: payload.currency || '$',
      billingCycle: payload.billingCycle || 'MONTHLY',
      features,
      startDate,
      endDate,
      isActive,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      isDefaultPricing,
    });

    return this.formatPlanDocument(created);
  }

  async updateMembershipPlan(id: string, payload: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid membership plan ID');
    }

    const plan = await MembershipPlan.findById(id);
    if (!plan) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Membership plan not found');
    }

    const nextName = payload.planName || payload.title || payload.name;
    if (nextName !== undefined) {
      plan.title = String(nextName).trim();
      plan.planName = String(nextName).trim();
    }

    if (payload.price !== undefined || payload.planPrice !== undefined) {
      const p = Number(payload.price ?? payload.planPrice);
      if (!isNaN(p) && p >= 0) {
        plan.price = p;
      }
    }

    if (payload.currency !== undefined) {
      plan.currency = String(payload.currency).trim() || '$';
    }

    if (payload.billingCycle !== undefined) {
      plan.billingCycle = payload.billingCycle;
    }

    if (payload.features !== undefined) {
      if (Array.isArray(payload.features)) {
        plan.features = payload.features.map((f: any) => String(f).trim()).filter(Boolean);
      } else if (typeof payload.features === 'string') {
        plan.features = payload.features
          .split('\n')
          .map((f: string) => f.trim())
          .filter(Boolean);
      }
    } else if (Array.isArray(payload.planCategory)) {
      plan.features = payload.planCategory.map((f: any) => String(f).trim()).filter(Boolean);
    }

    if (typeof payload.planCategory === 'string' && payload.planCategory.trim()) {
      plan.planCategory = payload.planCategory.trim();
      if (!payload.targetRole) {
        plan.targetRole = inferTargetRole(payload.planCategory);
      }
    }

    if (payload.targetRole || payload.category) {
      plan.targetRole = inferTargetRole(payload.targetRole || payload.category);
    }

    if (payload.startDate !== undefined) {
      plan.startDate = payload.startDate ? parseFlexibleDate(payload.startDate) : undefined;
    }
    if (payload.endDate !== undefined) {
      plan.endDate = payload.endDate ? parseFlexibleDate(payload.endDate) : undefined;
    }

    if (payload.isDefaultPricing !== undefined || payload.defaultPricing !== undefined) {
      plan.isDefaultPricing = Boolean(payload.isDefaultPricing ?? payload.defaultPricing);
    }

    if (payload.action) {
      const act = String(payload.action).toUpperCase();
      if (act === 'DEACTIVATE') plan.isActive = false;
      else if (act === 'ACTIVATE') plan.isActive = true;
      else if (act === 'TOGGLE') plan.isActive = !plan.isActive;
    } else if (payload.isActive !== undefined || payload.active !== undefined) {
      plan.isActive = Boolean(payload.isActive ?? payload.active);
    } else if (payload.status !== undefined) {
      plan.isActive = String(payload.status).toUpperCase() === 'ACTIVE';
    }

    plan.status = plan.isActive ? 'ACTIVE' : 'INACTIVE';
    await plan.save();

    return this.formatPlanDocument(plan);
  }

  async deleteMembershipPlan(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid membership plan ID');
    }

    const deleted = await MembershipPlan.findByIdAndDelete(id);
    if (!deleted) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Membership plan not found');
    }

    return {
      deletedId: deleted._id,
      planName: deleted.planName || deleted.title,
    };
  }

  // =========================================================================
  // GRANT MEMBERSHIP
  // =========================================================================

  async getMembershipGrants(query: IAdminListQuery) {
    const categoryFilter = !isIgnoredFilter(query.category || query.role)
      ? inferTargetRole(String(query.category || query.role))
      : '';

    const grantQuery: Record<string, any> = {
      $or: [{ isAdminGrant: true }, { status: 'ACTIVE' }],
    };
    const subscriptions = await UserSubscription.find(grantQuery)
      .populate('userId', 'name email role avatar cvTier status')
      .populate('planId', 'title planName targetRole price')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const grantRows: any[] = [];

    for (const sub of subscriptions) {
      const u = sub.userId as any;
      if (!u || !u._id) continue;

      const start = sub.startDate || sub.createdAt || now;
      const end = sub.endDate || sub.nextBillingDate || null;
      const isExpired = end ? new Date(end) < now : false;
      const effectiveStatus = isExpired ? 'EXPIRED' : sub.status || 'ACTIVE';

      const cat = (sub.category || u.role || 'PLAYER').toUpperCase();
      if (categoryFilter && query.onlyCategoryGrants === 'true' && cat !== categoryFilter) {
        continue;
      }

      const startStr = formatDateYMD(start);
      const endStr = formatDateYMD(end);
      const planObj = sub.planId as any;
      const durationLabel =
        sub.duration ||
        (sub.durationMonths
          ? sub.durationMonths === 12
            ? '1 Year'
            : `${sub.durationMonths} Months`
          : planObj?.billingCycle === 'YEARLY'
            ? '1 Year'
            : planObj?.billingCycle === 'MONTHLY'
              ? '1 Month'
              : '');

      grantRows.push({
        _id: sub._id,
        grantId: sub._id,
        userId: u._id,
        userDetails: {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar: u.avatar || '',
          role: u.role,
        },
        name: u.name,
        email: u.email,
        category: cat,
        duration: durationLabel,
        durationMonths: sub.durationMonths || null,
        startDate: startStr,
        endDate: endStr,
        validityPeriod: startStr && endStr ? `${startStr} to ${endStr}` : startStr,
        status: effectiveStatus,
        isAdminGrant: Boolean(sub.isAdminGrant),
        createdAt: sub.createdAt,
      });
    }

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
    const statusFilter = !isIgnoredFilter(query.status)
      ? String(query.status).trim().toUpperCase()
      : '';

    const filteredGrants = grantRows.filter((g) => {
      if (statusFilter && g.status.toUpperCase() !== statusFilter) return false;
      if (search) {
        const hay = [g.name, g.email, g.category, g.duration, g.validityPeriod]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const userRoleFilter: Record<string, any> = {
      role: categoryFilter
        ? categoryFilter
        : { $in: ['PLAYER', 'COACH', 'ACADEMY', 'CLUB', 'AGENT'] },
      status: { $ne: 'BLOCKED' },
    };

    const candidateUsers = await UserModel.find(userRoleFilter)
      .select('_id name email role cvTier avatar')
      .sort({ name: 1 })
      .lean();

    const activeGrantByUser = new Map<string, string>();
    for (const sub of subscriptions) {
      const u = sub.userId as any;
      const planObj = sub.planId as any;
      if (sub.status === 'ACTIVE' && u?._id) {
        activeGrantByUser.set(
          u._id.toString(),
          planObj?.planName || planObj?.title || sub.duration || 'ACTIVE',
        );
      }
    }

    const dropdownUsers = candidateUsers.map((cu: any) => {
      const uid = cu._id.toString();
      const activePlan = activeGrantByUser.get(uid);
      const currentPlan = activePlan || (cu.cvTier ? String(cu.cvTier).toUpperCase() : '');

      return {
        _id: cu._id,
        userId: cu._id,
        name: cu.name,
        email: cu.email,
        role: cu.role,
        category: cu.role,
        currentPlan,
        displayLabel: currentPlan
          ? `${cu.name} (${currentPlan} - ${cu.email})`
          : `${cu.name} (${cu.email})`,
      };
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filteredGrants.length;
    const paginatedGrants = filteredGrants.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        totalGrants: grantRows.filter((g) => g.status === 'ACTIVE').length,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        dropdownUsers,
      },
      data: paginatedGrants,
    };
  }

  async grantMembership(
    payload: {
      userId: string;
      category?: string;
      userCategory?: string;
      duration?: string | number;
      membershipDuration?: string | number;
      startDate?: string;
      endDate?: string;
    },
    adminUserId?: string,
  ) {
    const { user, detectedRole } = await adminUserActionsService.resolveTargetById(payload.userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Selected user not found');
    }

    const category = inferTargetRole(
      payload.category || payload.userCategory || user.role || detectedRole || 'PLAYER',
    );
    const { months, label: durationLabel } = parseDurationInput(
      payload.duration ?? payload.membershipDuration,
    );

    const startDate = parseFlexibleDate(payload.startDate) || new Date();
    let endDate = parseFlexibleDate(payload.endDate);
    if (!endDate) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
    }

    const matchingPlan = await MembershipPlan.findOne({
      targetRole: category,
      isActive: true,
    })
      .select('_id')
      .lean();

    const subscription = await UserSubscription.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          ...(matchingPlan ? { planId: matchingPlan._id } : {}),
          status: 'ACTIVE',
          amountPaid: 0,
          startDate,
          endDate,
          nextBillingDate: endDate,
          isAdminGrant: true,
          ...(adminUserId && Types.ObjectId.isValid(adminUserId)
            ? { grantedBy: new Types.ObjectId(adminUserId) }
            : {}),
          category,
          duration: durationLabel,
          durationMonths: months,
        },
      },
      { upsert: true, new: true },
    );

    if (user.role === 'PLAYER') {
      user.cvTier = 'GOLD';
      await user.save();
      await PlayerProfile.findOneAndUpdate({ userId: user._id }, { $set: { cvTier: 'GOLD' } });
    } else if (user.role === 'COACH') {
      user.cvTier = 'GOLD';
      await user.save();
      await CoachProfile.findOneAndUpdate({ userId: user._id }, { $set: { cvTier: 'GOLD' } });
    } else if (user.role === 'ACADEMY') {
      await AcademyProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { currentPlan: 'PREMIUM', maxTeams: 20 } },
      );
    } else if (user.role === 'CLUB') {
      user.isVerified = true;
      user.verificationStatus = 'APPROVED';
      user.verifiedAt = user.verifiedAt || new Date();
      await user.save();
      await ClubProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
      );
    } else if (user.role === 'AGENT') {
      user.isVerified = true;
      user.verificationStatus = 'APPROVED';
      user.verifiedAt = user.verifiedAt || new Date();
      await user.save();
      await AgentProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
      );
    }

    const startStr = formatDateYMD(startDate);
    const endStr = formatDateYMD(endDate);

    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: 'Premium Membership Granted!',
      message: `Congratulations! The K10 Super Admin has granted you ${durationLabel} of direct Premium Membership access (${startStr} to ${endStr}).`,
      type: 'SUBSCRIPTION',
      data: {
        grantId: subscription._id,
        category,
        duration: durationLabel,
        startDate: startStr,
        endDate: endStr,
        status: 'ACTIVE',
      },
    }).catch(() => null);

    return {
      _id: subscription._id,
      grantId: subscription._id,
      userId: user._id,
      userDetails: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        role: user.role,
      },
      name: user.name,
      email: user.email,
      category,
      duration: durationLabel,
      durationMonths: months,
      startDate: startStr,
      endDate: endStr,
      validityPeriod: `${startStr} to ${endStr}`,
      status: 'ACTIVE',
      isAdminGrant: true,
      createdAt: subscription.createdAt,
    };
  }

  async revokeMembershipGrant(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid grant ID');
    }

    let deleted = await UserSubscription.findByIdAndDelete(id);
    if (!deleted) {
      deleted = await UserSubscription.findOneAndDelete({ userId: id });
    }

    if (!deleted) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Active membership grant not found');
    }

    return {
      deletedGrantId: deleted._id,
      userId: deleted.userId,
      category: deleted.category || null,
      status: 'REVOKED',
    };
  }
}

export const adminMembershipService = new AdminMembershipService();
