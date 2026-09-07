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
    opponentTeam: { type: String, required: true },
    matchDate: { type: Date, required: true },
    plottedEventsJson: { type: String },
    coachReviewStatus: {
      type: String,
      enum: ['PENDING', 'EVALUATED', 'UNREQUESTED'],
      default: 'UNREQUESTED',
    },
    coachReviewPrice: { type: Number, default: 0 },
    coachRating: { type: Number },
  },
  { timestamps: true },
);

export const ParentProfile = model<IParentProfileDocument>('ParentProfile', ParentProfileSchema);
export const ParentChild = model<IParentChildDocument>('ParentChild', ParentChildSchema);
export const ParentMatchReport = model<IParentMatchReportDocument>(
  'ParentMatchReport',
  ParentMatchReportSchema,
);
