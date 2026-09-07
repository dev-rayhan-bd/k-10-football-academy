import { Schema, model } from 'mongoose';
import {
  IAcademyProfileDocument,
  ITeamDocument,
  IGameReportDocument,
  IPlayerEvaluationDocument,
} from './academy.interface';

const AcademyProfileSchema = new Schema<IAcademyProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    establishedDate: { type: Date },
    country: { type: String, required: true },
    city: { type: String, required: true },
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
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true },
    evaluationDate: { type: Date, required: true },
    overallRating: { type: Number, required: true },
    technicalScore: { type: Number, required: true },
    physicalScore: { type: Number, required: true },
    mentalScore: { type: Number, required: true },
    improvementDelta: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['EVALUATED', 'NEED_EVALUATION', 'EXPIRED', 'OVERDUE'],
      default: 'NEED_EVALUATION',
    },
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
