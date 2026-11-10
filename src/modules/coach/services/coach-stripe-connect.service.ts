import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { User } from '@/modules/user/user.model';
import { CoachProfile } from '../coach.model';
import { AcademyFinanceTransaction } from '@/modules/academy/academy.model';
import { PlayerProfile } from '@/modules/player/player.model';

export class CoachStripeConnectService {
  private resolveCountryCode(rawCountry?: string, fallbackCountry = 'US'): string {
    if (!rawCountry) return fallbackCountry;
    const c = rawCountry.trim().toUpperCase();
    if (c.length === 2 && /^[A-Z]{2}$/.test(c)) return c;
    const countryMap: Record<string, string> = {
      'UNITED STATES': 'US',
      USA: 'US',
      'UNITED KINGDOM': 'GB',
      UK: 'GB',
      ENGLAND: 'GB',
      SCOTLAND: 'GB',
      WALES: 'GB',
      SPAIN: 'ES',
      PORTUGAL: 'PT',
      BRAZIL: 'BR',
      FRANCE: 'FR',
      GERMANY: 'DE',
      ITALY: 'IT',
      NETHERLANDS: 'NL',
      CANADA: 'CA',
      AUSTRALIA: 'AU',
      MEXICO: 'MX',
    };
    return countryMap[c] || fallbackCountry;
  }

  private async resolveCoachProfile(user: any, coachIdentifier?: string) {
    const targetId =
      coachIdentifier && coachIdentifier !== 'me'
        ? coachIdentifier
        : user?.userId || user?.id || user?._id;

    let coach = null;
    if (targetId && Types.ObjectId.isValid(String(targetId))) {
      const objId = new Types.ObjectId(String(targetId));
      coach = await CoachProfile.findOne({
        $or: [{ userId: objId }, { _id: objId }],
      });
    }

    if (!coach && user?.role === 'SUPER_ADMIN') {
      coach = await CoachProfile.findOne().sort({ createdAt: -1 });
    }

    if (!coach && targetId && Types.ObjectId.isValid(String(targetId))) {
      const userDoc = await User.findById(targetId);
      if (userDoc) {
        coach = await CoachProfile.create({
          userId: userDoc._id,
          fullName: userDoc.name || 'Official Coach',
          email: userDoc.email,
          coachType: 'INDIVIDUAL_COACH',
          status: 'ACTIVE',
        });
      }
    }

    if (!coach) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Coach profile not found');
    }

    return coach;
  }

  private async getCoachPayoutSummary(coach: any) {
    const coachIdentifiers = [coach._id, coach.userId].filter(Boolean);

    const verifiedPlayers = await PlayerProfile.find({
      $or: [
        { verifyingCoachId: { $in: coachIdentifiers } },
        { 'coachVerification.verifiedByCoachId': { $in: coachIdentifiers } },
        { 'coachVerification.coachName': coach.fullName },
      ],
      $and: [{ $or: [{ isVerifiedByCoach: true }, { 'coachVerification.isVerified': true }] }],
    })
      .select('_id')
      .lean();

    const verifiedPlayerIds = verifiedPlayers.map((p) => p._id);

    const transactions = await AcademyFinanceTransaction.find({
      $or: [
        { coachId: { $in: coachIdentifiers } },
        { playerId: { $in: verifiedPlayerIds }, transactionType: 'CV Validation' },
      ],
    }).lean();

    let totalEarnedCommission = 0;
    let totalTransferredAmount = 0;
    let pendingTransferAmount = 0;
    let pendingTransferCount = 0;
    let transferredCount = 0;

    for (const tx of transactions) {
      const share =
        tx.commissionCoach !== undefined && tx.commissionCoach !== null && tx.commissionCoach > 0
          ? Number(tx.commissionCoach)
          : tx.transactionType === 'CV Validation'
            ? 12.0
            : 0;
      totalEarnedCommission += share;
      if (tx.payoutStatusCoach === 'PAID') {
        totalTransferredAmount += share;
        transferredCount++;
      } else {
        pendingTransferAmount += share;
        pendingTransferCount++;
      }
    }

    return {
      totalEarnedCommission: parseFloat(totalEarnedCommission.toFixed(2)),
      totalTransferredAmount: parseFloat(totalTransferredAmount.toFixed(2)),
      pendingTransferAmount: parseFloat(pendingTransferAmount.toFixed(2)),
      pendingTransferCount,
      transferredCount,
    };
  }

  /**
   * 1. Create or Retrieve Stripe Express Connect Account for Coach and generate Onboarding Link
   */
  async createConnectOnboardingLink(
    user: any,
    coachIdentifier?: string,
    hostOrigin?: string,
    bodyOptions?: { returnUrl?: string; refreshUrl?: string; country?: string },
  ) {
    const coach = await this.resolveCoachProfile(user, coachIdentifier);
    const stripe = getStripeClient();

    let stripeAccountId = coach.stripeConnect?.stripeAccountId;

    // Verify if stored stripeAccountId still exists under the current Stripe API key
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (verifyErr: any) {
        logger.warn(
          { stripeAccountId, err: verifyErr?.message },
          'Stored Coach Stripe Connect account not found or invalid under current Stripe key; recreating account.',
        );
        stripeAccountId = undefined;
      }
    }

    if (!stripeAccountId) {
      const userDoc = await User.findById(coach.userId);
      const email = coach.email || userDoc?.email || 'coach@k10football.com';

      let platformCountry = 'US';
      try {
        const platformAccount = await (stripe.accounts as any).retrieve();
        if (platformAccount?.country) {
          platformCountry = platformAccount.country;
        }
      } catch {
        // Fallback to US if platform account lookup fails
      }

      const countryCode = this.resolveCountryCode(
        bodyOptions?.country || coach.stripeConnect?.country || coach.birthCountry,
        platformCountry,
      );

      const nameParts = (coach.fullName || 'Official Coach').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Official';
      const lastName = nameParts.slice(1).join(' ') || 'Coach';

      try {
        const account = await stripe.accounts.create({
          type: 'express',
          country: countryCode,
          email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          individual: {
            first_name: firstName,
            last_name: lastName,
            email,
          },
          metadata: {
            coachId: coach._id.toString(),
            coachName: coach.fullName || 'Official Coach',
            userId: (coach.userId as any)?.toString() || '',
          },
        });

        stripeAccountId = account.id;

        coach.stripeConnect = {
          stripeAccountId: account.id,
          accountStatus: 'PENDING',
          detailsSubmitted: account.details_submitted || false,
          payoutsEnabled: account.payouts_enabled || false,
          chargesEnabled: account.charges_enabled || false,
          country: countryCode,
          currency: account.default_currency || 'usd',
          connectedAt: new Date(),
        };

        await coach.save();
        logger.info(
          `Stripe Connect Express account created for Coach ${coach.fullName}: ${account.id}`,
        );
      } catch (stripeErr: any) {
        logger.error({ stripeErr }, 'Error creating Coach Stripe Connect account');
        const isConnectNotEnabled =
          stripeErr?.message?.includes('signed up for Connect') ||
          stripeErr?.message?.includes('dashboard.stripe.com/connect');
        throw new AppError(
          isConnectNotEnabled ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR,
          isConnectNotEnabled
            ? `Stripe Connect is not enabled on the platform Stripe account yet. Please activate Connect in your Stripe Dashboard at https://dashboard.stripe.com/connect and try again.`
            : `Failed to initialize Coach Stripe Connect account: ${stripeErr.message}`,
        );
      }
    }

    const baseUrl = (hostOrigin || env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const returnUrl =
      bodyOptions?.returnUrl || `${baseUrl}/dashboard/coach/finances?connect_status=return`;
    const refreshUrl =
      bodyOptions?.refreshUrl || `${baseUrl}/dashboard/coach/finances?connect_status=refresh`;

    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return {
        success: true,
        coachId: coach._id,
        coachName: coach.fullName,
        stripeAccountId,
        onboardingUrl: accountLink.url,
        returnUrl,
        refreshUrl,
        expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
        message: 'Coach Stripe onboarding URL generated successfully',
      };
    } catch (linkErr: any) {
      logger.error({ linkErr }, 'Error generating Coach Stripe account link');
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Failed to generate Coach Stripe onboarding link: ${linkErr.message}`,
      );
    }
  }

  /**
   * 2. Check and sync Coach Stripe Connect Account Status
   */
  async getConnectStatus(user: any, coachIdentifier?: string) {
    const coach = await this.resolveCoachProfile(user, coachIdentifier);

    if (!coach.stripeConnect?.stripeAccountId) {
      const payoutSummary = await this.getCoachPayoutSummary(coach);
      return {
        coachId: coach._id,
        coachName: coach.fullName,
        isConnected: false,
        accountStatus: 'NOT_CONNECTED',
        stripeAccountId: null,
        detailsSubmitted: false,
        payoutsEnabled: false,
        chargesEnabled: false,
        payoutSummary,
        message: 'Coach has not initiated Stripe Connect onboarding yet.',
      };
    }

    const stripe = getStripeClient();

    try {
      const account = await stripe.accounts.retrieve(coach.stripeConnect.stripeAccountId);

      const isFullyActive = Boolean(account.details_submitted && account.payouts_enabled);
      const status = isFullyActive ? 'ACTIVE' : 'PENDING';

      coach.stripeConnect.detailsSubmitted = account.details_submitted || false;
      coach.stripeConnect.payoutsEnabled = account.payouts_enabled || false;
      coach.stripeConnect.chargesEnabled = account.charges_enabled || false;
      coach.stripeConnect.accountStatus = status;
      if (account.default_currency) {
        coach.stripeConnect.currency = account.default_currency;
      }

      await coach.save();

      const payoutSummary = await this.getCoachPayoutSummary(coach);

      return {
        coachId: coach._id,
        coachName: coach.fullName,
        isConnected: true,
        accountStatus: status,
        stripeAccountId: account.id,
        detailsSubmitted: account.details_submitted || false,
        payoutsEnabled: account.payouts_enabled || false,
        chargesEnabled: account.charges_enabled || false,
        currency: account.default_currency || 'usd',
        country: account.country,
        requirements: {
          currentlyDue: account.requirements?.currently_due || [],
          eventuallyDue: account.requirements?.eventually_due || [],
          pastDue: account.requirements?.past_due || [],
          disabledReason: account.requirements?.disabled_reason || null,
        },
        payoutSummary,
        message: isFullyActive
          ? 'Coach Stripe account is fully active and ready to receive CV validation commission payouts ($12.00 per validation) when Admin disburses payouts.'
          : 'Stripe onboarding is in progress or pending verification.',
      };
    } catch (err: any) {
      logger.error({ err }, 'Error retrieving Coach Stripe connected account status');
      const payoutSummary = await this.getCoachPayoutSummary(coach);
      return {
        coachId: coach._id,
        coachName: coach.fullName,
        isConnected: true,
        accountStatus: coach.stripeConnect.accountStatus || 'PENDING',
        stripeAccountId: coach.stripeConnect.stripeAccountId,
        detailsSubmitted: coach.stripeConnect.detailsSubmitted || false,
        payoutsEnabled: coach.stripeConnect.payoutsEnabled || false,
        chargesEnabled: coach.stripeConnect.chargesEnabled || false,
        payoutSummary,
        message: 'Could not sync with Stripe API in real-time, returning cached status.',
      };
    }
  }

  /**
   * 3. Generate Single Sign-On (SSO) Login Link to Stripe Express Dashboard for Coach
   */
  async createDashboardLoginLink(user: any, coachIdentifier?: string) {
    const coach = await this.resolveCoachProfile(user, coachIdentifier);

    if (!coach.stripeConnect?.stripeAccountId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Coach has not connected a Stripe account yet. Please generate an onboarding link via POST /api/v1/coaches/me/stripe/connect first.',
      );
    }

    const stripe = getStripeClient();

    try {
      const account = await stripe.accounts.retrieve(coach.stripeConnect.stripeAccountId);
      if (!account.details_submitted) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Stripe Express onboarding is not completed yet. Please complete the onboarding form first before accessing the Stripe Express Dashboard.',
        );
      }

      const loginLink = await stripe.accounts.createLoginLink(coach.stripeConnect.stripeAccountId);
      return {
        coachId: coach._id,
        coachName: coach.fullName,
        stripeAccountId: coach.stripeConnect.stripeAccountId,
        loginUrl: loginLink.url,
        dashboardUrl: loginLink.url,
        message: 'Coach Stripe Express dashboard login link generated successfully',
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Error creating Coach Stripe Express login link');
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Cannot open Stripe Express dashboard: ${err.message}. Please complete onboarding first.`,
      );
    }
  }

  /**
   * 4. Transfer Commission to Coach's Connected Stripe Account (Triggered when Admin pays Coach via POST /api/v1/admin/payouts/record)
   */
  async transferCommissionToCoach(
    coachId: Types.ObjectId | string,
    amount: number,
    description: string,
  ) {
    if (!coachId || amount <= 0) return { success: false, reason: 'Invalid parameters' };

    const coach = await CoachProfile.findById(coachId);
    if (!coach) {
      logger.warn(`Cannot transfer commission: Coach not found for ID ${coachId}`);
      return { success: false, reason: 'Coach not found' };
    }

    const stripeAccountId = coach.stripeConnect?.stripeAccountId;
    let payoutsEnabled = coach.stripeConnect?.payoutsEnabled;

    const stripe = getStripeClient();

    // Real-time check with Stripe if stripeAccountId exists
    if (stripeAccountId && !payoutsEnabled) {
      try {
        const account = await stripe.accounts.retrieve(stripeAccountId);
        if (account.payouts_enabled) {
          payoutsEnabled = true;
          coach.stripeConnect!.payoutsEnabled = true;
          coach.stripeConnect!.detailsSubmitted = account.details_submitted || false;
          coach.stripeConnect!.chargesEnabled = account.charges_enabled || false;
          coach.stripeConnect!.accountStatus = 'ACTIVE';
          await coach.save();
        }
      } catch {
        // Ignore and fallback to cached status
      }
    }

    if (!stripeAccountId || !payoutsEnabled) {
      logger.info(
        `Coach ${coach.fullName} (${coach._id}) has not completed Stripe onboarding. Payout ($${amount}) recorded in internal ledger.`,
      );
      return { success: false, reason: 'Stripe onboarding pending' };
    }

    const amountInCents = Math.round(amount * 100);

    try {
      const transfer = await stripe.transfers.create({
        amount: amountInCents,
        currency: 'usd',
        destination: stripeAccountId,
        description:
          description || `K10 Football CV Validation Commission Payout to ${coach.fullName}`,
        metadata: {
          coachId: coach._id.toString(),
          userId: coach.userId ? coach.userId.toString() : '',
        },
      });

      logger.info(
        `Automated Stripe transfer of $${amount} to Coach ${coach.fullName} (${stripeAccountId}) completed. Transfer ID: ${transfer.id}`,
      );

      return {
        success: true,
        transferId: transfer.id,
        amount,
        coachName: coach.fullName,
      };
    } catch (transferErr: any) {
      logger.error(
        { transferErr },
        `Stripe transfer failed for Coach ${coach.fullName} (${stripeAccountId}): ${transferErr.message}`,
      );
      return { success: false, reason: transferErr.message };
    }
  }
}

export const coachStripeConnectService = new CoachStripeConnectService();
