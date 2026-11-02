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
  /**
   * 1. Create or Retrieve Stripe Express Connect Account and generate Onboarding Link
   */
  async createConnectOnboardingLink(user: any, academyIdentifier?: string, hostOrigin?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);
    const stripe = getStripeClient();

    let stripeAccountId = academy.stripeConnect?.stripeAccountId;

    if (!stripeAccountId) {
      const userDoc = await User.findById(academy.userId);
      const email = academy.contactEmail || userDoc?.email || 'academy@k10football.com';

      // Default country code: 'GB' for United Kingdom or ISO code
      let countryCode = 'GB';
      if (academy.country) {
        const c = academy.country.trim().toUpperCase();
        if (c === 'US' || c === 'USA' || c === 'UNITED STATES') countryCode = 'US';
        else if (c === 'GB' || c === 'UK' || c === 'UNITED KINGDOM') countryCode = 'GB';
        else if (c.length === 2) countryCode = c;
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
            name: academy.name,
          },
          metadata: {
            academyId: academy._id.toString(),
            academyName: academy.name,
            userId: (academy.userId as any)?.toString(),
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
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          `Failed to initialize Stripe Connect account: ${stripeErr.message}`,
        );
      }
    }

    const baseUrl = hostOrigin || env.CLIENT_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/academy/finance?connect_status=return`;
    const refreshUrl = `${baseUrl}/academy/finance?connect_status=refresh`;

    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return {
        success: true,
        stripeAccountId,
        onboardingUrl: accountLink.url,
        expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
        message: 'Stripe onboarding URL generated successfully',
      };
    } catch (linkErr: any) {
      logger.error({ linkErr }, 'Error generating Stripe account link');
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to generate Stripe onboarding link: ${linkErr.message}`,
      );
    }
  }

  /**
   * 2. Check and sync Academy Stripe Connect Account Status
   */
  async getConnectStatus(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    if (!academy.stripeConnect?.stripeAccountId) {
      return {
        isConnected: false,
        accountStatus: 'NOT_CONNECTED',
        stripeAccountId: null,
        detailsSubmitted: false,
        payoutsEnabled: false,
        chargesEnabled: false,
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

      return {
        isConnected: true,
        accountStatus: status,
        stripeAccountId: account.id,
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        currency: account.default_currency || 'usd',
        country: account.country,
        message: isFullyActive
          ? 'Stripe account is fully active and ready to receive automatic payouts.'
          : 'Stripe onboarding is in progress or pending verification.',
      };
    } catch (err: any) {
      logger.error({ err }, 'Error retrieving Stripe connected account status');
      return {
        isConnected: true,
        accountStatus: academy.stripeConnect.accountStatus || 'PENDING',
        stripeAccountId: academy.stripeConnect.stripeAccountId,
        detailsSubmitted: academy.stripeConnect.detailsSubmitted || false,
        payoutsEnabled: academy.stripeConnect.payoutsEnabled || false,
        chargesEnabled: academy.stripeConnect.chargesEnabled || false,
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
        'Academy has not connected a Stripe account yet.',
      );
    }

    const stripe = getStripeClient();

    try {
      const loginLink = await stripe.accounts.createLoginLink(
        academy.stripeConnect.stripeAccountId,
      );
      return {
        loginUrl: loginLink.url,
        message: 'Stripe Express dashboard login link generated successfully',
      };
    } catch (err: any) {
      logger.error({ err }, 'Error creating Stripe Express login link');
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Cannot open dashboard: ${err.message}. Please complete onboarding first.`,
      );
    }
  }

  /**
   * 4. Automated Transfer of Commission to Academy's Connected Stripe Account
   * Called automatically when Game Report (Option B) or CV Validation payment succeeds
   */
  async transferCommissionToAcademy(
    academyId: Types.ObjectId | string,
    amount: number,
    description: string,
    relatedTransactionId?: string,
  ) {
    if (!academyId || amount <= 0) return { success: false, reason: 'Invalid parameters' };

    const academy = await AcademyProfile.findById(academyId);
    if (!academy) {
      logger.warn(`Cannot transfer commission: Academy not found for ID ${academyId}`);
      return { success: false, reason: 'Academy not found' };
    }

    const stripeAccountId = academy.stripeConnect?.stripeAccountId;
    const payoutsEnabled = academy.stripeConnect?.payoutsEnabled;

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

    const stripe = getStripeClient();
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
        await AcademyFinanceTransaction.findByIdAndUpdate(relatedTransactionId, {
          payoutStatus: 'TRANSFERRED',
          stripeTransferId: transfer.id,
          transferredAmount: amount,
          transferredAt: new Date(),
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
