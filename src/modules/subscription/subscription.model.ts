import { Schema, model } from 'mongoose';
import { IMembershipPlanDocument, IUserSubscriptionDocument } from './subscription.interface';

const MembershipPlanSchema = new Schema<IMembershipPlanDocument>(
  {
    title: { type: String, required: true, trim: true },
    planName: { type: String, trim: true },
    planCategory: { type: String, trim: true },
    targetRole: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true },
    currency: { type: String, default: '$' },
    billingCycle: { type: String, enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' },
    features: { type: [String], default: [] },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    isDefaultPricing: { type: Boolean, default: false },
  },
  { timestamps: true },
);

MembershipPlanSchema.pre('save', function (next) {
  if (!this.planName && this.title) {
    this.planName = this.title;
  } else if (!this.title && this.planName) {
    this.title = this.planName;
  }
  this.status = this.isActive ? 'ACTIVE' : 'INACTIVE';
  next();
});

const UserSubscriptionSchema = new Schema<IUserSubscriptionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan', required: false },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING_PAYMENT', 'CANCELLED', 'EXPIRED'],
      default: 'PENDING_PAYMENT',
      index: true,
    },
    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    amountPaid: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    nextBillingDate: { type: Date },
    isAdminGrant: { type: Boolean, default: false, index: true },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    category: { type: String, trim: true },
    duration: { type: String, trim: true },
    durationMonths: { type: Number },
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
