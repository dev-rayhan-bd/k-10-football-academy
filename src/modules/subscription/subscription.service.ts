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

  /**
   * Current active subscription status and remaining days
   * (history has been separated into GET /billing-history)
   */
  async getUserSubscription(userId: string) {
    if (!userId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User ID is required');
    }

    const user = await UserModel.findById(userId).select('role name email').lean();

    const subscriptions = await UserSubscription.find({ userId })
      .populate('planId')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const now = new Date();

    let currentDoc: any = null;
    for (const sub of subscriptions) {
      const targetDate = sub.endDate || sub.nextBillingDate;
      const isStillValid = !targetDate || new Date(targetDate).getTime() > now.getTime();
      if (sub.status === 'ACTIVE' && isStillValid) {
        currentDoc = sub;
        break;
      }
    }

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
    };
  }

  /**
   * Monthly billing & deduction history
   * Returns exact charges by month ("kun mas e koto kata hoice"), deduction dates, and transaction invoices
   */
  async getBillingHistory(userId: string) {
    if (!userId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User ID is required');
    }

    const user = await UserModel.findById(userId).select('role name email').lean();

    const subscriptions = await UserSubscription.find({ userId })
      .populate('planId')
      .sort({ createdAt: -1 })
      .lean();

    const platformPayments = await PlatformPayment.find({
      userId,
      category: { $in: ['SUBSCRIPTION', 'MEMBERSHIP_SUBSCRIPTION'] },
    })
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    const chargeMap = new Map<string, any>();

    const formatDate = (date: Date | string) => {
      const d = new Date(date);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getMonthName = (date: Date | string) => {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // e.g. "November 2026"
    };

    const getMonthKey = (date: Date | string) => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`; // e.g. "2026-11"
    };

    for (const sub of subscriptions) {
      const plan: any = sub.planId || {};
      const amountPaid = typeof sub.amountPaid === 'number' ? sub.amountPaid : plan.price || 0;
      const chargeDate = sub.startDate || sub.createdAt || new Date();
      const currency = plan.currency || '$';
      const key = sub._id.toString();

      const start = sub.startDate || sub.createdAt;
      const end = sub.endDate || sub.nextBillingDate;
      const billingPeriod =
        start && end ? `${formatDate(start)} - ${formatDate(end)}` : formatDate(chargeDate);

      const dObj = new Date(chargeDate);
      const invYear = dObj.getFullYear();
      const invMonth = String(dObj.getMonth() + 1).padStart(2, '0');
      const invoiceNumber = `INV-${invYear}${invMonth}-${key.slice(-4).toUpperCase()}`;

      chargeMap.set(key, {
        id: key,
        month: getMonthName(chargeDate),
        monthKey: getMonthKey(chargeDate),
        planTitle: plan.title || plan.planName || sub.category || 'Membership Plan',
        planCategory:
          plan.targetRole || plan.planCategory || sub.category || user?.role || 'GENERAL',
        billingCycle: plan.billingCycle || (sub.durationMonths === 12 ? 'YEARLY' : 'MONTHLY'),
        amountDeducted: amountPaid,
        currency,
        formattedAmount: `${currency}${amountPaid}`,
        chargeDate,
        billingPeriod,
        status: sub.status === 'PENDING_PAYMENT' ? 'PENDING' : 'PAID',
        paymentMethod: sub.isAdminGrant ? 'ADMIN_GRANT' : 'STRIPE',
        transactionId: sub.stripeSessionId || sub.stripePaymentIntentId || null,
        invoiceNumber,
        isAdminGrant: Boolean(sub.isAdminGrant),
      });

      if (Array.isArray((sub as any).history)) {
        for (const h of (sub as any).history) {
          const hChargeDate = h.purchasedAt || h.startDate || h.createdAt || new Date();
          const hKey = h._id ? h._id.toString() : `${sub._id}_${new Date(hChargeDate).getTime()}`;
          const hObj = new Date(hChargeDate);
          const hInv = `INV-${hObj.getFullYear()}${String(hObj.getMonth() + 1).padStart(2, '0')}-${hKey.slice(-4).toUpperCase()}`;

          chargeMap.set(hKey, {
            id: hKey,
            month: getMonthName(hChargeDate),
            monthKey: getMonthKey(hChargeDate),
            planTitle: h.planTitle || plan.title || 'Membership Plan',
            planCategory: h.planCategory || plan.targetRole || user?.role || 'GENERAL',
            billingCycle: h.billingCycle || 'MONTHLY',
            amountDeducted: h.amountPaid || 0,
            currency: h.currency || '$',
            formattedAmount: `${h.currency || '$'}${h.amountPaid || 0}`,
            chargeDate: hChargeDate,
            billingPeriod:
              h.startDate && h.endDate
                ? `${formatDate(h.startDate)} - ${formatDate(h.endDate)}`
                : formatDate(hChargeDate),
            status: 'PAID',
            paymentMethod: h.isAdminGrant ? 'ADMIN_GRANT' : 'STRIPE',
            transactionId: h.stripeSessionId || h.stripePaymentIntentId || null,
            invoiceNumber: hInv,
            isAdminGrant: Boolean(h.isAdminGrant),
          });
        }
      }
    }

    for (const pp of platformPayments) {
      const pKey = pp.transactionId || pp.paymentCode || pp._id.toString();
      if (!chargeMap.has(pKey)) {
        const ppDate = pp.paymentDate || pp.createdAt || new Date();
        chargeMap.set(pKey, {
          id: pp._id.toString(),
          month: getMonthName(ppDate),
          monthKey: getMonthKey(ppDate),
          planTitle: pp.notes || pp.type || 'Membership Subscription',
          planCategory: pp.entityRole || user?.role || 'GENERAL',
          billingCycle: 'MONTHLY',
          amountDeducted: pp.amount || 0,
          currency: pp.currency || '$',
          formattedAmount: `${pp.currency || '$'}${pp.amount || 0}`,
          chargeDate: ppDate,
          billingPeriod: formatDate(ppDate),
          status: pp.status === 'COMPLETED' ? 'PAID' : pp.status,
          paymentMethod: pp.paymentMethod || 'STRIPE',
          transactionId: pp.transactionId || pp.paymentCode || null,
          invoiceNumber:
            pp.paymentCode ||
            `INV-${new Date(ppDate).getFullYear()}-${pp._id.toString().slice(-4).toUpperCase()}`,
          isAdminGrant: false,
        });
      }
    }

    // Sort all charges latest first
    const allCharges = Array.from(chargeMap.values()).sort(
      (a, b) => new Date(b.chargeDate).getTime() - new Date(a.chargeDate).getTime(),
    );

    // Group charges by month ("kun mas e koto kata hoice")
    const monthlyGroups = new Map<string, any>();
    for (const charge of allCharges) {
      const groupKey = charge.monthKey;
      if (!monthlyGroups.has(groupKey)) {
        monthlyGroups.set(groupKey, {
          month: charge.month,
          monthKey: groupKey,
          totalDeducted: 0,
          currency: '$',
          chargesCount: 0,
          charges: [],
        });
      }
      const group = monthlyGroups.get(groupKey);
      group.totalDeducted = parseFloat(
        (group.totalDeducted + Number(charge.amountDeducted || 0)).toFixed(2),
      );
      group.chargesCount += 1;
      group.charges.push(charge);
    }

    const monthlyBreakdown = Array.from(monthlyGroups.values()).sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey),
    );

    const totalAmountDeducted = allCharges.reduce(
      (sum, item) => sum + (Number(item.amountDeducted) || 0),
      0,
    );

    return {
      totalAmountDeducted: parseFloat(totalAmountDeducted.toFixed(2)),
      currency: '$',
      totalChargesCount: allCharges.length,
      monthlyBreakdown,
      allCharges,
    };
  }
}

export const subscriptionService = new SubscriptionService();
