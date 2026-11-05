/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IMembershipPlan } from './subscription.interface';
import { MembershipPlan, UserSubscription } from './subscription.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { notificationService } from '@/modules/notification/notification.service';
import { PlatformPayment } from '@/modules/admin/admin.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';

export class SubscriptionService {
  async createPlan(payload: Partial<IMembershipPlan>) {
    return MembershipPlan.create(payload);
  }

  async getActivePlans(role?: string) {
    const filter: Record<string, unknown> = { isActive: true };
    if (role) {
      filter.targetRole = String(role).toUpperCase();
    }
    return MembershipPlan.find(filter).sort({ createdAt: 1 });
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

    const amountPaid = sessionObject.amount_total
      ? sessionObject.amount_total / 100
      : plan?.price || 0;

    // Check if an existing subscription exists for this user to preserve in history
    const existingSub = await UserSubscription.findOne({ userId });
    let historyPush: any = null;
    if (existingSub && existingSub.status === 'ACTIVE') {
      historyPush = {
        planId: existingSub.planId,
        planTitle: plan?.title || plan?.planName || existingSub.category || 'Membership Plan',
        planCategory: plan?.targetRole || existingSub.category,
        billingCycle: plan?.billingCycle || 'MONTHLY',
        amountPaid: existingSub.amountPaid || 0,
        currency: plan?.currency || '$',
        status: 'EXPIRED',
        startDate: existingSub.startDate,
        endDate: existingSub.endDate || existingSub.nextBillingDate,
        purchasedAt: existingSub.createdAt || existingSub.startDate,
        stripeSessionId: existingSub.stripeSessionId,
        stripePaymentIntentId: existingSub.stripePaymentIntentId,
        isAdminGrant: existingSub.isAdminGrant,
      };
    }

    const updatePayload: any = {
      userId,
      planId,
      status: 'ACTIVE',
      stripeSessionId: sessionObject.id,
      stripePaymentIntentId:
        typeof sessionObject.payment_intent === 'string'
          ? sessionObject.payment_intent
          : sessionObject.payment_intent?.id,
      amountPaid,
      startDate: new Date(),
      endDate: nextBillingDate,
      nextBillingDate,
      category: plan?.targetRole,
      duration: plan?.billingCycle,
    };

    const updateOps: any = { $set: updatePayload };
    if (historyPush) {
      updateOps.$push = { history: historyPush };
    }

    const subscription = await UserSubscription.findOneAndUpdate({ userId }, updateOps, {
      upsert: true,
      new: true,
    }).populate('planId');

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

      await notificationService.notifyAdmins({
        settingKey: 'paymentAlerts',
        title: 'New Subscription Payment Received',
        message: `${user.name || 'A user'} (${user.role}) has purchased a ${plan?.planName || plan?.title || 'membership'} plan for $${plan?.price || 0}.`,
        type: 'PAYMENT',
        data: { userId: user._id, subscriptionId: subscription._id, planId },
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
    if (!userId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User ID is required');
    }

    const user = await UserModel.findById(userId).select('role name email').lean();

    // 1. Fetch all subscription records for this user, latest first
    const subscriptions = await UserSubscription.find({ userId })
      .populate('planId')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    // 2. Fetch any platform payments for subscriptions
    const platformPayments = await PlatformPayment.find({
      userId,
      category: { $in: ['SUBSCRIPTION', 'MEMBERSHIP_SUBSCRIPTION'] },
    })
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    const now = new Date();

    // 3. Find the most relevant active/current subscription
    let currentDoc: any = null;
    for (const sub of subscriptions) {
      const targetDate = sub.endDate || sub.nextBillingDate;
      const isStillValid = !targetDate || new Date(targetDate).getTime() > now.getTime();
      if (sub.status === 'ACTIVE' && isStillValid) {
        currentDoc = sub;
        break;
      }
    }

    // If no valid active subscription found, pick the latest subscription document
    if (!currentDoc && subscriptions.length > 0) {
      currentDoc = subscriptions[0];
    }

    let currentSubscription: any = null;

    if (currentDoc) {
      const plan: any = currentDoc.planId || {};
      const targetDate = currentDoc.endDate || currentDoc.nextBillingDate;
      let daysRemaining = 0;
      let isExpired = false;

      if (targetDate) {
        const diffMs = new Date(targetDate).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        isExpired = diffMs <= 0;
      } else if (currentDoc.status === 'EXPIRED') {
        isExpired = true;
        daysRemaining = 0;
      }

      const effectiveStatus = isExpired ? 'EXPIRED' : currentDoc.status;
      const isExpiringSoon = !isExpired && daysRemaining > 0 && daysRemaining <= 5;

      const planTitle = plan.title || plan.planName || currentDoc.category || 'Membership Plan';
      const planCategory =
        plan.targetRole || plan.planCategory || currentDoc.category || user?.role || 'GENERAL';
      const billingCycle =
        plan.billingCycle || (currentDoc.durationMonths === 12 ? 'YEARLY' : 'MONTHLY');
      const amountPaid =
        typeof currentDoc.amountPaid === 'number' ? currentDoc.amountPaid : plan.price || 0;
      const currency = plan.currency || '$';

      currentSubscription = {
        id: currentDoc._id.toString(),
        planId: plan._id
          ? plan._id.toString()
          : currentDoc.planId
            ? currentDoc.planId.toString()
            : null,
        planTitle,
        planCategory,
        billingCycle,
        amountPaid,
        currency,
        formattedAmount: `${currency}${amountPaid}`,
        status: effectiveStatus,
        startDate: currentDoc.startDate || currentDoc.createdAt,
        endDate: currentDoc.endDate || currentDoc.nextBillingDate || null,
        nextBillingDate: currentDoc.nextBillingDate || currentDoc.endDate || null,
        daysRemaining: effectiveStatus === 'ACTIVE' ? daysRemaining : 0,
        isExpired,
        isExpiringSoon,
        isAdminGrant: Boolean(currentDoc.isAdminGrant),
        features: Array.isArray(plan.features) ? plan.features : [],
        paymentReference:
          currentDoc.stripeSessionId ||
          currentDoc.stripePaymentIntentId ||
          (currentDoc.isAdminGrant ? 'Admin Grant' : 'Stripe Payment'),
      };
    }

    // 4. Construct complete chronological history (kobe kobe kince, koto diye kince)
    const historyMap = new Map<string, any>();

    for (const sub of subscriptions) {
      const plan: any = sub.planId || {};
      const targetDate = sub.endDate || sub.nextBillingDate;
      let daysRemaining = 0;
      let isExpired = false;

      if (targetDate) {
        const diffMs = new Date(targetDate).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        isExpired = diffMs <= 0;
      }

      const effectiveStatus = isExpired ? 'EXPIRED' : sub.status;
      const planTitle = plan.title || plan.planName || sub.category || 'Membership Plan';
      const amountPaid = typeof sub.amountPaid === 'number' ? sub.amountPaid : plan.price || 0;
      const currency = plan.currency || '$';
      const key = sub._id.toString();

      historyMap.set(key, {
        id: key,
        planTitle,
        planCategory:
          plan.targetRole || plan.planCategory || sub.category || user?.role || 'GENERAL',
        billingCycle: plan.billingCycle || (sub.durationMonths === 12 ? 'YEARLY' : 'MONTHLY'),
        amountPaid,
        currency,
        formattedAmount: `${currency}${amountPaid}`,
        status: effectiveStatus,
        startDate: sub.startDate || sub.createdAt,
        endDate: sub.endDate || sub.nextBillingDate || null,
        purchasedAt: sub.createdAt || sub.startDate || new Date(),
        daysRemaining: effectiveStatus === 'ACTIVE' ? daysRemaining : 0,
        isAdminGrant: Boolean(sub.isAdminGrant),
        paymentReference:
          sub.stripeSessionId ||
          sub.stripePaymentIntentId ||
          (sub.isAdminGrant ? 'Admin Grant' : 'Stripe Payment'),
      });

      if (Array.isArray((sub as any).history)) {
        for (const h of (sub as any).history) {
          const hKey = h._id
            ? h._id.toString()
            : `${sub._id}_${new Date(h.purchasedAt || h.createdAt).getTime()}`;
          historyMap.set(hKey, {
            id: hKey,
            planTitle: h.planTitle || planTitle,
            planCategory: h.planCategory || plan.targetRole || user?.role || 'GENERAL',
            billingCycle: h.billingCycle || 'MONTHLY',
            amountPaid: h.amountPaid || 0,
            currency: h.currency || '$',
            formattedAmount: `${h.currency || '$'}${h.amountPaid || 0}`,
            status: h.status || 'EXPIRED',
            startDate: h.startDate,
            endDate: h.endDate,
            purchasedAt: h.purchasedAt || h.createdAt,
            daysRemaining: 0,
            isAdminGrant: Boolean(h.isAdminGrant),
            paymentReference: h.stripeSessionId || h.stripePaymentIntentId || 'Historical Payment',
          });
        }
      }
    }

    for (const pp of platformPayments) {
      const pKey = pp.transactionId || pp.paymentCode || pp._id.toString();
      if (!historyMap.has(pKey)) {
        historyMap.set(pKey, {
          id: pp._id.toString(),
          planTitle: pp.notes || pp.type || 'Membership Subscription',
          planCategory: pp.entityRole || user?.role || 'GENERAL',
          billingCycle: 'MONTHLY',
          amountPaid: pp.amount || 0,
          currency: pp.currency || '$',
          formattedAmount: `${pp.currency || '$'}${pp.amount || 0}`,
          status: pp.status === 'COMPLETED' ? 'ACTIVE' : pp.status,
          startDate: pp.paymentDate || pp.createdAt,
          endDate: null,
          purchasedAt: pp.paymentDate || pp.createdAt,
          daysRemaining: 0,
          isAdminGrant: false,
          paymentReference: pp.transactionId || pp.paymentCode || 'Stripe Payment',
        });
      }
    }

    const history = Array.from(historyMap.values()).sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    );

    const totalSpent = history.reduce((sum, item) => sum + (Number(item.amountPaid) || 0), 0);

    const hasActiveSubscription = Boolean(
      currentSubscription &&
      currentSubscription.status === 'ACTIVE' &&
      !currentSubscription.isExpired,
    );

    return {
      hasActiveSubscription,
      userRole: user?.role || null,
      currentSubscription: hasActiveSubscription
        ? currentSubscription
        : currentSubscription || null,
      summary: {
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        currency: '$',
        totalSubscriptionsCount: history.length,
      },
      history,
    };
  }
}

export const subscriptionService = new SubscriptionService();
