import { Document, Types } from 'mongoose';

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'ACTIVE' | 'PENDING_PAYMENT' | 'CANCELLED' | 'EXPIRED';

export interface IMembershipPlan {
  title: string;
  planName?: string;
  planCategory?: string;
  targetRole: string;
  price: number;
  currency?: string;
  billingCycle: BillingCycle;
  features?: string[];
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  isDefaultPricing?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMembershipPlanDocument extends IMembershipPlan, Document {}

export interface IUserSubscription {
  userId: Types.ObjectId;
  planId?: Types.ObjectId;
  status: SubscriptionStatus;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  amountPaid?: number;
  startDate?: Date;
  endDate?: Date;
  nextBillingDate?: Date;
  isAdminGrant?: boolean;
  grantedBy?: Types.ObjectId;
  category?: string;
  duration?: string;
  durationMonths?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserSubscriptionDocument extends IUserSubscription, Document {}
