import { Schema, model } from 'mongoose';
import {
  IAcademyProfileDocument,
  ITeamDocument,
  IGameReportDocument,
  IPlayerEvaluationDocument,
  IAcademyCoachDocument,
} from './academy.interface';

const AcademyProfileSchema = new Schema<IAcademyProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, default: 'General Academy' },
    establishedDate: { type: Date },
    country: { type: String, default: 'Bangladesh' },
    city: { type: String, default: 'Dhaka' },
    location: { type: String },
    registrationId: { type: String },
    estimatedAcademySize: { type: String },
    logo: { type: String },
    coverPhoto: { type: String },
    description: { type: String },
    visionAndMission: { type: String },
    trainingPhilosophy: { type: String },
  },
  { timestamps: true },
);

const TeamSchema = new Schema<ITeamDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    teamName: { type: String, required: true },
    ageGroup: { type: String, required: true },
    coachesCount: { type: Number, default: 0 },
    playersCount: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

const GameReportSchema = new Schema<IGameReportDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    scoutName: { type: String },
    matchName: { type: String, required: true },
    matchDate: { type: Date, required: true },
    overallPerformanceScore: { type: Number, required: true },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    passes: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'UNPAID'],
      default: 'UNPAID',
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'APPROVED'],
      default: 'PENDING',
    },
  },
  { timestamps: true },
);

const PlayerEvaluationSchema = new Schema<IPlayerEvaluationDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    evaluationDate: { type: Date, default: Date.now },
    overallRating: { type: Number },
    technicalScore: { type: Number },
    physicalScore: { type: Number },
    mentalScore: { type: Number },
    improvementDelta: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['EVALUATED', 'NEED_EVALUATION', 'EXPIRED', 'OVERDUE'],
      default: 'NEED_EVALUATION',
      index: true,
    },
    nextEvaluationDue: { type: Date, index: true },
    expiresAt: { type: Date, index: true },
    requestedByManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    reminderSentAt: { type: Date },
    reminderCount: { type: Number, default: 0 },
    coachFeedback: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

export const AcademyProfile = model<IAcademyProfileDocument>(
  'AcademyProfile',
  AcademyProfileSchema,
);
export const Team = model<ITeamDocument>('Team', TeamSchema);
export const GameReport = model<IGameReportDocument>('GameReport', GameReportSchema);
export const PlayerEvaluation = model<IPlayerEvaluationDocument>(
  'PlayerEvaluation',
  PlayerEvaluationSchema,
);

const AcademyCoachSchema = new Schema<IAcademyCoachDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    coachUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, default: 'Youth Coach' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'REMOVED'],
      default: 'PENDING',
      index: true,
    },
    requestedBy: {
      type: String,
      enum: ['ACADEMY', 'COACH'],
      required: true,
    },
    requestMessage: { type: String },
    responseNote: { type: String },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true },
);

AcademyCoachSchema.index({ academyId: 1, coachId: 1 }, { unique: true });
AcademyCoachSchema.index({ academyId: 1, status: 1 });
AcademyCoachSchema.index({ coachId: 1, status: 1 });

export const AcademyCoach = model<IAcademyCoachDocument>('AcademyCoach', AcademyCoachSchema);
