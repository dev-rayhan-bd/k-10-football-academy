import { Schema, model, Document, Types } from 'mongoose';

export type AdminPaymentStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface IPlatformPayment {
  paymentCode?: string;
  overrideTargetId?: string;
  sourceModel?: string;
  type: string;
  category: string;
  userId?: Types.ObjectId;
  entityId?: Types.ObjectId;
  userOrEntityName: string;
  entityEmail?: string;
  entityRole?: string;
  entityAvatar?: string;
  amount: number;
  spend: number;
  commissionPaid: number;
  commissionRate?: string;
  commissionRecipient?: string;
  adminEarnings: number;
  currency: string;
  paymentDate: Date;
  status: AdminPaymentStatus;
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
  createdByAdminId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlatformPaymentDocument extends IPlatformPayment, Document {}

const PlatformPaymentSchema = new Schema<IPlatformPaymentDocument>(
  {
    paymentCode: { type: String, trim: true, index: true },
    overrideTargetId: { type: String, trim: true, index: true },
    sourceModel: { type: String, trim: true, default: 'PlatformPayment' },
    type: { type: String, required: true, trim: true, default: 'Subscription', index: true },
    category: {
      type: String,
      required: true,
      trim: true,
      default: 'SUBSCRIPTION',
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    userOrEntityName: { type: String, required: true, trim: true },
    entityEmail: { type: String, trim: true },
    entityRole: { type: String, trim: true, index: true },
    entityAvatar: { type: String },
    amount: { type: Number, required: true, default: 0 },
    spend: { type: Number, required: true, default: 0 },
    commissionPaid: { type: Number, required: true, default: 0 },
    commissionRate: { type: String, default: '0%' },
    commissionRecipient: { type: String, trim: true },
    adminEarnings: { type: Number, required: true, default: 0 },
    currency: { type: String, default: '$' },
    paymentDate: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'],
      default: 'COMPLETED',
      index: true,
    },
    paymentMethod: { type: String, default: 'STRIPE' },
    transactionId: { type: String, trim: true, index: true },
    notes: { type: String, trim: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

PlatformPaymentSchema.pre('save', function (next) {
  const gross = Number(this.amount) || 0;
  const sp = Number(this.spend ?? this.commissionPaid) || 0;
  this.spend = sp;
  if (this.commissionPaid === undefined || this.commissionPaid === null) {
    this.commissionPaid = sp;
  }
  this.adminEarnings = parseFloat((gross - sp).toFixed(2));
  next();
});

export const PlatformPayment = model<IPlatformPaymentDocument>(
  'PlatformPayment',
  PlatformPaymentSchema,
);
