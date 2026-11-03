import { Schema, model } from 'mongoose';
import { ILegalPolicyDocument } from './cms.interface';

const LegalPolicySchema = new Schema<ILegalPolicyDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: ['TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'MEDIA_CONSENT', 'COOKIE_POLICY'],
      default: 'TERMS_AND_CONDITIONS',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    version: {
      type: String,
      required: true,
      default: '1.0',
    },
    isMajorUpdate: {
      type: Boolean,
      default: false,
    },
    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    summaryOfChanges: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

LegalPolicySchema.index({ type: 1, version: 1 }, { unique: true });
LegalPolicySchema.index({ type: 1, isCurrent: 1, isPublished: 1 });

export const LegalPolicy = model<ILegalPolicyDocument>('LegalPolicy', LegalPolicySchema);
