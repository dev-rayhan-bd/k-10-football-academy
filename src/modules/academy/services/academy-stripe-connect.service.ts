import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { User } from '@/modules/user/user.model';
import { AcademyFinanceTransaction, AcademyProfile } from '../academy.model';
import { academyResolverService } from './academy-resolver.service';

export class AcademyStripeConnectService {
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

  /**
   * 1. Create or Retrieve Stripe Express Connect Account and generate Onboarding Link
   */
  async createConnectOnboardingLink(
    user: any,
    academyIdentifier?: string,
    hostOrigin?: string,
    bodyOptions?: { returnUrl?: string; refreshUrl?: string; country?: string },
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);
    const stripe = getStripeClient();

    let stripeAccountId = academy.stripeConnect?.stripeAccountId;

    // Verify if stored stripeAccountId still exists under the current Stripe API key
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (verifyErr: any) {
        logger.warn(
          { stripeAccountId, err: verifyErr?.message },
          'Stored Stripe Connect account not found or invalid under current Stripe key; recreating account.',
        );
        stripeAccountId = undefined;
      }
    }

    if (!stripeAccountId) {
      const userDoc = await User.findById(academy.userId);
      const email = academy.contactEmail || userDoc?.email || 'academy@k10football.com';

      let platformCountry = 'US';
      try {
        const platformAccount = await (stripe.accounts as any).retrieve();
        if (platformAccount?.country) {
          platformCountry = platformAccount.country;
        }
      } catch {
        // Fallback to US if platform account lookup fails
      }

      const targetCountry =
        bodyOptions?.country || academy.stripeConnect?.country || academy.country;
      let countryCode = this.resolveCountryCode(targetCountry, platformCountry);

      // Stripe Cross-Border Connect restriction check:
      // A US platform cannot create Express connected accounts in Brazil (BR), India (IN), etc. without custom Stripe approval.
      // If platform is US and the country is BR, fallback to platformCountry (US) or a supported Stripe Express country.
      const unsupportedByUsPlatform = ['BR', 'IN', 'ID', 'PH'];
      if (platformCountry === 'US' && unsupportedByUsPlatform.includes(countryCode)) {
        logger.warn(
          `Academy ${academy.name} country '${countryCode}' is not supported for cross-border Express Connect by US platform. Falling back to platform country '${platformCountry}'.`,
        );
        countryCode = platformCountry;
      }

      try {
        const account = await stripe.accounts.create({
          type: 'express',
          country: countryCode,
          email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'company',
          company: {
            name: academy.name || 'Official Football Academy',
          },
          metadata: {
            academyId: academy._id.toString(),
            academyName: academy.name || 'Official Football Academy',
            userId: (academy.userId as any)?.toString() || '',
          },
        });

        stripeAccountId = account.id;

        academy.stripeConnect = {
          stripeAccountId: account.id,
          accountStatus: 'PENDING',
          detailsSubmitted: account.details_submitted || false,
          payoutsEnabled: account.payouts_enabled || false,
          chargesEnabled: account.charges_enabled || false,
          country: countryCode,
          currency: account.default_currency || 'usd',
          connectedAt: new Date(),
        };

        await academy.save();
        logger.info(
          `Stripe Connect Express account created for Academy ${academy.name}: ${account.id}`,
        );
      } catch (stripeErr: any) {
        logger.error({ stripeErr }, 'Error creating Stripe Connect account');
        const isConnectNotEnabled =
          stripeErr?.message?.includes('signed up for Connect') ||
          stripeErr?.message?.includes('dashboard.stripe.com/connect');
        throw new AppError(
          isConnectNotEnabled ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR,
          isConnectNotEnabled
            ? `Stripe Connect is not enabled on the platform Stripe account yet. Please activate Connect in your Stripe Dashboard at https://dashboard.stripe.com/connect and try again.`
            : `Failed to initialize Stripe Connect account: ${stripeErr.message}`,
        );
      }
    }

    const baseUrl = (hostOrigin || env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const returnUrl = bodyOptions?.returnUrl || `${baseUrl}/academy/finance?connect_status=return`;
    const refreshUrl =
      bodyOptions?.refreshUrl || `${baseUrl}/academy/finance?connect_status=refresh`;

    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return {
        success: true,
        academyId: academy._id,
        academyName: academy.name,
        stripeAccountId,
        onboardingUrl: accountLink.url,
        returnUrl,
        refreshUrl,
        expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
        message: 'Stripe onboarding URL generated successfully',
      };
    } catch (linkErr: any) {
      logger.error({ linkErr }, 'Error generating Stripe account link');
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Failed to generate Stripe onboarding link: ${linkErr.message}`,
      );
    }
  }

  /**
   * Helper: Calculate payout summary for an Academy from AcademyFinanceTransaction
   */
  private async getAcademyPayoutSummary(academyId: Types.ObjectId | string) {
    const transactions = await AcademyFinanceTransaction.find({
      academyId,
      commissionAcademy: { $gt: 0 },
    }).lean();

    let totalEarnedCommission = 0;
    let totalTransferredAmount = 0;
    let pendingTransferAmount = 0;
    let pendingTransferCount = 0;
    let transferredCount = 0;

    for (const tx of transactions) {
      const share = Number(tx.commissionAcademy || 0);
      totalEarnedCommission += share;
      if (tx.payoutStatus === 'TRANSFERRED') {
        totalTransferredAmount += Number(tx.transferredAmount || share);
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
   * 2. Check and sync Academy Stripe Connect Account Status
   */
  async getConnectStatus(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    if (!academy.stripeConnect?.stripeAccountId) {
      const payoutSummary = await this.getAcademyPayoutSummary(academy._id);
      return {
        academyId: academy._id,
        academyName: academy.name,
        isConnected: false,
        accountStatus: 'NOT_CONNECTED',
        stripeAccountId: null,
        detailsSubmitted: false,
        payoutsEnabled: false,
        chargesEnabled: false,
        payoutSummary,
        message: 'Academy has not initiated Stripe Connect onboarding yet.',
      };
    }

    const stripe = getStripeClient();

    try {
      const account = await stripe.accounts.retrieve(academy.stripeConnect.stripeAccountId);

      const isFullyActive = Boolean(account.details_submitted && account.payouts_enabled);
      const status = isFullyActive ? 'ACTIVE' : 'PENDING';

      academy.stripeConnect.detailsSubmitted = account.details_submitted || false;
      academy.stripeConnect.payoutsEnabled = account.payouts_enabled || false;
      academy.stripeConnect.chargesEnabled = account.charges_enabled || false;
      academy.stripeConnect.accountStatus = status;
      if (account.default_currency) {
        academy.stripeConnect.currency = account.default_currency;
      }

      await academy.save();

      const payoutSummary = await this.getAcademyPayoutSummary(academy._id);

      return {
        academyId: academy._id,
        academyName: academy.name,
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
          ? 'Stripe account is fully active and ready to receive direct Extra Event & Shop payments and Admin commission payouts.'
          : 'Stripe onboarding is in progress or pending verification.',
      };
    } catch (err: any) {
      logger.error({ err }, 'Error retrieving Stripe connected account status');
      const payoutSummary = await this.getAcademyPayoutSummary(academy._id);
      return {
        academyId: academy._id,
        academyName: academy.name,
        isConnected: true,
        accountStatus: academy.stripeConnect.accountStatus || 'PENDING',
        stripeAccountId: academy.stripeConnect.stripeAccountId,
        detailsSubmitted: academy.stripeConnect.detailsSubmitted || false,
        payoutsEnabled: academy.stripeConnect.payoutsEnabled || false,
        chargesEnabled: academy.stripeConnect.chargesEnabled || false,
        payoutSummary,
        message: 'Could not sync with Stripe API in real-time, returning cached status.',
      };
    }
  }

  /**
   * 3. Generate Single Sign-On (SSO) Login Link to Stripe Express Dashboard
   */
  async createDashboardLoginLink(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    if (!academy.stripeConnect?.stripeAccountId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Academy has not connected a Stripe account yet. Please generate an onboarding link via POST /api/v1/academies/me/stripe/connect first.',
      );
    }

    const stripe = getStripeClient();

    try {
      const account = await stripe.accounts.retrieve(academy.stripeConnect.stripeAccountId);
      if (!account.details_submitted) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Stripe Express onboarding is not completed yet. Please complete the onboarding form first before accessing the Stripe Express Dashboard.',
        );
      }

      const loginLink = await stripe.accounts.createLoginLink(
        academy.stripeConnect.stripeAccountId,
      );
      return {
        academyId: academy._id,
        academyName: academy.name,
        stripeAccountId: academy.stripeConnect.stripeAccountId,
        loginUrl: loginLink.url,
        dashboardUrl: loginLink.url,
        message: 'Stripe Express dashboard login link generated successfully',
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Error creating Stripe Express login link');
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Cannot open Stripe Express dashboard: ${err.message}. Please complete onboarding first.`,
      );
    }
  }

  /**
   * Resolve active Stripe Connected Account ID for direct destination charges (Extra Events & Academy Shop)
   */
  async getActiveConnectedStripeAccountId(
    academyId?: Types.ObjectId | string | null,
  ): Promise<string | null> {
    if (!academyId || !Types.ObjectId.isValid(String(academyId))) return null;

    const academy = await AcademyProfile.findById(academyId);
    const stripeAccountId = academy?.stripeConnect?.stripeAccountId;
    if (!stripeAccountId) return null;

    if (academy?.stripeConnect?.chargesEnabled || academy?.stripeConnect?.payoutsEnabled) {
      return stripeAccountId;
    }

    try {
      const stripe = getStripeClient();
      const account = await stripe.accounts.retrieve(stripeAccountId);
      if (account.charges_enabled || account.payouts_enabled || account.details_submitted) {
        academy!.stripeConnect!.chargesEnabled = account.charges_enabled || false;
        academy!.stripeConnect!.payoutsEnabled = account.payouts_enabled || false;
        academy!.stripeConnect!.detailsSubmitted = account.details_submitted || false;
        if (account.details_submitted && account.payouts_enabled) {
          academy!.stripeConnect!.accountStatus = 'ACTIVE';
        }
        await academy!.save();
      }
      if (account.charges_enabled || account.payouts_enabled) {
        return stripeAccountId;
      }
    } catch {
      // Ignore if account lookup fails
    }

    return null;
  }

  /**
   * 4. Transfer of Commission to Academy's Connected Stripe Account (Triggered when Admin pays Academy)
   */
  async transferCommissionToAcademy(
    academyId: Types.ObjectId | string,
    amount: number,
    description: string,
    relatedTransactionId?: string,
  ) {
    if (!academyId || amount <= 0) return { success: false, reason: 'Invalid parameters' };

    // Idempotency guard: prevent double-transferring an already transferred transaction
    if (relatedTransactionId && Types.ObjectId.isValid(relatedTransactionId)) {
      const existingTx = await AcademyFinanceTransaction.findById(relatedTransactionId);
      if (existingTx?.payoutStatus === 'TRANSFERRED' && existingTx?.stripeTransferId) {
        return {
          success: true,
          alreadyTransferred: true,
          transferId: existingTx.stripeTransferId,
          amount: existingTx.transferredAmount || amount,
        };
      }
    }

    const academy = await AcademyProfile.findById(academyId);
    if (!academy) {
      logger.warn(`Cannot transfer commission: Academy not found for ID ${academyId}`);
      return { success: false, reason: 'Academy not found' };
    }

    const stripeAccountId = academy.stripeConnect?.stripeAccountId;
    let payoutsEnabled = academy.stripeConnect?.payoutsEnabled;

    const stripe = getStripeClient();

    // Real-time check with Stripe if stripeAccountId exists but payoutsEnabled was cached as false
    if (stripeAccountId && !payoutsEnabled) {
      try {
        const account = await stripe.accounts.retrieve(stripeAccountId);
        if (account.payouts_enabled) {
          payoutsEnabled = true;
          academy.stripeConnect!.payoutsEnabled = true;
          academy.stripeConnect!.detailsSubmitted = account.details_submitted || false;
          academy.stripeConnect!.chargesEnabled = account.charges_enabled || false;
          academy.stripeConnect!.accountStatus = 'ACTIVE';
          await academy.save();
        }
      } catch {
        // Ignore and fallback to cached status
      }
    }

    if (!stripeAccountId || !payoutsEnabled) {
      logger.info(
        `Academy ${academy.name} (${academy._id}) has not completed Stripe onboarding. Commission ($${amount}) retained in internal ledger as PENDING_TRANSFER.`,
      );

      if (relatedTransactionId) {
        await AcademyFinanceTransaction.findByIdAndUpdate(relatedTransactionId, {
          payoutStatus: 'PENDING_TRANSFER',
          notes: `Academy Stripe onboarding pending. Commission ($${amount}) recorded in internal ledger.`,
        });
      }
      return { success: false, reason: 'Stripe onboarding pending' };
    }

    const amountInCents = Math.round(amount * 100);

    try {
      const transfer = await stripe.transfers.create({
        amount: amountInCents,
        currency: 'usd',
        destination: stripeAccountId,
        description: description || `K10 Football Commission Transfer to ${academy.name}`,
        metadata: {
          academyId: academy._id.toString(),
          relatedTransactionId: relatedTransactionId || '',
        },
      });

      logger.info(
        `Automated Stripe transfer of $${amount} to Academy ${academy.name} (${stripeAccountId}) completed. Transfer ID: ${transfer.id}`,
      );

      if (relatedTransactionId) {
        const now = new Date();
        await AcademyFinanceTransaction.findByIdAndUpdate(relatedTransactionId, {
          payoutStatus: 'TRANSFERRED',
          stripeTransferId: transfer.id,
          transferredAmount: amount,
          transferredAt: now,
          payoutStatusAcademy: 'PAID',
          payoutReferenceAcademy: transfer.id,
          paidAtAcademy: now,
        });
      }

      return {
        success: true,
        transferId: transfer.id,
        amount,
        academyName: academy.name,
      };
    } catch (transferErr: any) {
      logger.error(
        { transferErr },
        `Stripe transfer failed for Academy ${academy.name} (${stripeAccountId}): ${transferErr.message}`,
      );

      if (relatedTransactionId) {
        await AcademyFinanceTransaction.findByIdAndUpdate(relatedTransactionId, {
          payoutStatus: 'FAILED',
          notes: `Stripe transfer attempt failed: ${transferErr.message}`,
        });
      }

      return { success: false, reason: transferErr.message };
    }
  }
}

export const academyStripeConnectService = new AcademyStripeConnectService();
