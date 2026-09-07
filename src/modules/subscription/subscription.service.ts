import { AppError } from '@/utils/AppError';
import { IMembershipPlan } from './subscription.interface';
import { MembershipPlan, UserSubscription } from './subscription.model';

export class SubscriptionService {
  async createPlan(payload: Partial<IMembershipPlan>) {
    return MembershipPlan.create(payload);
  }

  async getActivePlans() {
    return MembershipPlan.find({ isActive: true });
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

    return UserSubscription.create({
      userId,
      planId,
      status: 'ACTIVE',
      nextBillingDate,
    });
  }

  async getUserSubscription(userId: string) {
    return UserSubscription.findOne({ userId, status: 'ACTIVE' }).populate('planId');
  }
}

export const subscriptionService = new SubscriptionService();
