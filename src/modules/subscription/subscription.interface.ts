import { Document, Types } from 'mongoose';

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED';

export interface IMembershipPlan {
  title: string;
  targetRole: string;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMembershipPlanDocument extends IMembershipPlan, Document {}

export interface IUserSubscription {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  nextBillingDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserSubscriptionDocument extends IUserSubscription, Document {}
