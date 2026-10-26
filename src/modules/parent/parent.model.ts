import { Schema, model } from 'mongoose';
import {
  IParentProfileDocument,
  IParentChildDocument,
  IParentMatchReportDocument,
} from './parent.interface';

const ParentProfileSchema = new Schema<IParentProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    contactPhone: { type: String, required: true },
    alternatePhone: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    relationship: { type: String },
    occupation: { type: String },
    streetAddress: { type: String },
    city: { type: String },
    zipCode: { type: String },
    notes: { type: String },
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile' },
  },
  { timestamps: true },
);

const ParentChildSchema = new Schema<IParentChildDocument>(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile', required: true },
    childPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    relationshipType: {
      type: String,
      enum: ['FATHER', 'MOTHER', 'GUARDIAN'],
      required: true,
    },
  },
  { timestamps: true },
);

const ParentMatchReportSchema = new Schema<IParentMatchReportDocument>(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile', required: true },
    childPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'User' },
    opponentTeam: { type: String, required: true },
    matchDate: { type: Date, required: true },
    plottedEventsJson: { type: String },
    plottedCount: { type: Number, default: 0 },
    coachReviewStatus: {
      type: String,
      enum: ['PENDING', 'EVALUATED', 'UNREQUESTED', 'AWAITING_PAYMENT', 'REJECTED'],
      default: 'UNREQUESTED',
    },
    coachReviewPrice: { type: Number, default: 25 },
    coachRating: { type: Number },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'FREE'],
      default: 'UNPAID',
    },
    transactionId: { type: String },
    checkoutUrl: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

ParentMatchReportSchema.index({ childPlayerId: 1, matchDate: -1 });

export const ParentProfile = model<IParentProfileDocument>('ParentProfile', ParentProfileSchema);
export const ParentChild = model<IParentChildDocument>('ParentChild', ParentChildSchema);
export const ParentMatchReport = model<IParentMatchReportDocument>(
  'ParentMatchReport',
  ParentMatchReportSchema,
);
