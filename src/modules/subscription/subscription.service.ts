import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IMembershipPlan } from './subscription.interface';
import { MembershipPlan, UserSubscription } from './subscription.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';

export class SubscriptionService {
  async createPlan(payload: Partial<IMembershipPlan>) {
    return MembershipPlan.create(payload);
  }

  async getActivePlans(role?: string) {
    // Ensure the 1 single flat price plan for CLUB exists ($199/month)
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

    // Ensure the 1 single flat price plan for AGENT exists ($99/month)
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

    const filter: Record<string, unknown> = { isActive: true };
    if (role) {
      filter.targetRole = String(role).toUpperCase();
    }
    return MembershipPlan.find(filter);
  }

  async subscribe(userId: string, planId: string) {
    const plan = await MembershipPlan.findById(planId);
    if (!plan || !plan.isActive) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Active membership plan not found');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    // Step 1: Admin verification and approval check
    if (
      user.role === 'CLUB' ||
      user.role === 'AGENT' ||
      plan.targetRole === 'CLUB' ||
      plan.targetRole === 'AGENT'
    ) {
      if (user.verificationStatus !== 'APPROVED') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          `Access Denied: Your ${user.role.toLowerCase()} account credentials and verification documents must be approved by the Administrator before purchasing a subscription.`,
        );
      }
    }

    // Step 2: Create Stripe Checkout Session
    const stripe = getStripeClient();
    const clientBaseUrl = env.CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const successUrl = `${clientBaseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&planId=${plan._id}`;
    const cancelUrl = `${clientBaseUrl}/subscription/cancel`;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.title,
              description: `K10 Football Platform - ${plan.targetRole} Access (${plan.billingCycle.toLowerCase()} subscription)`,
            },
            unit_amount: Math.round(plan.price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        paymentType: 'MEMBERSHIP_SUBSCRIPTION',
        type: 'MEMBERSHIP_SUBSCRIPTION',
        userId: user._id.toString(),
        planId: plan._id.toString(),
        targetRole: plan.targetRole,
        userRole: user.role,
      },
    });

    await UserSubscription.findOneAndUpdate(
      { userId },
      {
        userId,
        planId,
        status: 'PENDING_PAYMENT',
        stripeSessionId: session.id,
      },
      { upsert: true, new: true },
    );

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      planId: plan._id,
      planTitle: plan.title,
      targetRole: plan.targetRole,
      amount: plan.price,
      currency: 'USD',
      status: 'AWAITING_PAYMENT',
      message:
        'Stripe checkout session generated. Please complete payment via checkoutUrl to activate your subscription.',
    };
  }

  async handleSubscriptionStripeWebhook(sessionObject: any) {
    const userId = sessionObject?.metadata?.userId;
    const planId = sessionObject?.metadata?.planId;
    if (!userId || !planId) return null;

    const plan = await MembershipPlan.findById(planId);
    const nextBillingDate = new Date();
    if (plan?.billingCycle === 'YEARLY') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    const subscription = await UserSubscription.findOneAndUpdate(
      { userId },
      {
        userId,
        planId,
        status: 'ACTIVE',
        stripeSessionId: sessionObject.id,
        stripePaymentIntentId:
          typeof sessionObject.payment_intent === 'string'
            ? sessionObject.payment_intent
            : sessionObject.payment_intent?.id,
        amountPaid: sessionObject.amount_total
          ? sessionObject.amount_total / 100
          : plan?.price || 0,
        nextBillingDate,
      },
      { upsert: true, new: true },
    ).populate('planId');

    // Send In-App notification
    const user = await UserModel.findById(userId);
    if (user) {
      await Notification.create({
        recipientId: user._id,
        recipientRole: user.role,
        title: 'Subscription Activated!',
        message: `Your payment of $${plan?.price || 0} was successful. Full access to your ${user.role.toLowerCase()} dashboard and scouting tools has been unlocked!`,
        type: 'SUBSCRIPTION',
        data: { subscriptionId: subscription._id, planId, status: 'ACTIVE' },
      });
    }

    return subscription;
  }

  async verifyPayment(sessionId: string) {
    if (!sessionId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Stripe session ID is required');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Stripe checkout session not found');
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const subscription = await this.handleSubscriptionStripeWebhook(session);
      return {
        success: true,
        isPaid: true,
        message: 'Payment verified and subscription activated successfully! Access unlocked.',
        data: subscription,
      };
    }

    return {
      success: false,
      isPaid: false,
      message: `Payment is not completed. Current status: ${session.payment_status}`,
      status: session.payment_status,
    };
  }

  async getUserSubscription(userId: string) {
    return UserSubscription.findOne({ userId, status: 'ACTIVE' }).populate('planId');
  }
}

export const subscriptionService = new SubscriptionService();
