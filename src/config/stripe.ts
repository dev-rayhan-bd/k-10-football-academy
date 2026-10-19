import Stripe from 'stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

let stripeInstance: Stripe | null = null;

export const getStripeClient = (): Stripe => {
  if (!stripeInstance) {
    const secretKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      logger.warn('STRIPE_SECRET_KEY is missing from environment variables');
    }
    stripeInstance = new Stripe(secretKey || 'sk_test_dummy', {
      apiVersion: '2024-06-20' as any,
    });
  }
  return stripeInstance;
};
