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

export interface ISubscriptionHistoryItem {
  _id?: Types.ObjectId;
  planId?: Types.ObjectId;
  planTitle?: string;
  planCategory?: string;
  billingCycle?: BillingCycle;
  amountPaid: number;
  currency?: string;
  status: SubscriptionStatus;
  startDate?: Date;
  endDate?: Date;
  purchasedAt?: Date;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  isAdminGrant?: boolean;
  notes?: string;
}

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
  history?: ISubscriptionHistoryItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserSubscriptionDocument extends IUserSubscription, Document {}
