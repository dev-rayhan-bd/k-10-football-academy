import { Schema, model } from 'mongoose';
import {
  ICoachProfileDocument,
  ITacticalFormationDocument,
  ICoachTestimonialDocument,
} from './coach.interface';

const CoachProfileSchema = new Schema<ICoachProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    coachType: {
      type: String,
      enum: ['INDIVIDUAL_COACH', 'CLUB_COACH'],
      default: 'INDIVIDUAL_COACH',
    },
    fullName: { type: String, required: true },
    title: { type: String, required: true },
    yearsExperience: { type: Number, default: 0 },
    overallRatingScore: { type: Number, default: 5.0 },
    licenseStatus: { type: String, required: true },
    cvTier: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },
    speciality: { type: String, required: true },
    status: {
      type: String,
      enum: ['AVAILABLE', 'CONTRACTED', 'ACTIVE', 'INACTIVE'],
      default: 'AVAILABLE',
    },
    additionalNotes: { type: String },
    matchesCoached: { type: Number, default: 0 },
    totalWins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    cleanSheets: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const TacticalFormationSchema = new Schema<ITacticalFormationDocument>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true },
    formationSlot: { type: Number, enum: [1, 2, 3], required: true },
    formationName: { type: String, required: true },
    positionsJson: { type: String, required: true },
  },
  { timestamps: true },
);

const CoachTestimonialSchema = new Schema<ICoachTestimonialDocument>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    authorAvatar: { type: String },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
  },
  { timestamps: true },
);

export const CoachProfile = model<ICoachProfileDocument>('CoachProfile', CoachProfileSchema);
export const TacticalFormation = model<ITacticalFormationDocument>(
  'TacticalFormation',
  TacticalFormationSchema,
);
export const CoachTestimonial = model<ICoachTestimonialDocument>(
  'CoachTestimonial',
  CoachTestimonialSchema,
);
