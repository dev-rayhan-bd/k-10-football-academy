import { Schema, model } from 'mongoose';
import { IMembershipPlanDocument, IUserSubscriptionDocument } from './subscription.interface';

const MembershipPlanSchema = new Schema<IMembershipPlanDocument>(
  {
    title: { type: String, required: true },
    targetRole: { type: String, required: true },
    price: { type: Number, required: true },
    billingCycle: { type: String, enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const UserSubscriptionSchema = new Schema<IUserSubscriptionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    nextBillingDate: { type: Date },
  },
  { timestamps: true },
);

export const MembershipPlan = model<IMembershipPlanDocument>(
  'MembershipPlan',
  MembershipPlanSchema,
);
export const UserSubscription = model<IUserSubscriptionDocument>(
  'UserSubscription',
  UserSubscriptionSchema,
);
