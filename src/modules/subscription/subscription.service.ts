import { AppError } from '@/utils/AppError';
import { IMembershipPlan } from './subscription.interface';
import { MembershipPlan, UserSubscription } from './subscription.model';

export class SubscriptionService {
  async createPlan(payload: Partial<IMembershipPlan>) {
    return MembershipPlan.create(payload);
  }

  async getActivePlans(role?: string) {
    // Ensure the 1 single flat price plan for CLUB exists
    await MembershipPlan.findOneAndUpdate(
      { targetRole: 'CLUB', isActive: true },
      {
        $setOnInsert: {
          title: 'Professional Football Club Scouting Access',
          targetRole: 'CLUB',
          price: 199,
          billingCycle: 'MONTHLY',
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    // Ensure the 1 single flat price plan for AGENT exists
    await MembershipPlan.findOneAndUpdate(
      { targetRole: 'AGENT', isActive: true },
      {
        $setOnInsert: {
          title: 'Licensed Football Agent Recruitment Access',
          targetRole: 'AGENT',
          price: 99,
          billingCycle: 'MONTHLY',
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    const filter: any = { isActive: true };
    if (role) {
      filter.targetRole = String(role).toUpperCase();
    }
    return MembershipPlan.find(filter);
  }

  async subscribe(userId: string, planId: string) {
    const plan = await MembershipPlan.findById(planId);
    if (!plan || !plan.isActive) {
      throw new AppError(404, 'Active membership plan not found');
    }

    const nextBillingDate = new Date();
    if (plan.billingCycle === 'MONTHLY') {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    } else {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    }

    return UserSubscription.findOneAndUpdate(
      { userId },
      {
        userId,
        planId,
        status: 'ACTIVE',
        nextBillingDate,
      },
      { upsert: true, new: true },
    ).populate('planId');
  }

  async getUserSubscription(userId: string) {
    return UserSubscription.findOne({ userId, status: 'ACTIVE' }).populate('planId');
  }
}

export const subscriptionService = new SubscriptionService();
