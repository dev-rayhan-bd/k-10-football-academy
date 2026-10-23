import { Schema, model } from 'mongoose';
import {
  IAcademyProfileDocument,
  ITeamDocument,
  IGameReportDocument,
  IPlayerEvaluationDocument,
  IAcademyCoachDocument,
  ITransferRequestDocument,
  IAcademyFeePaymentDocument,
  IAcademyFinanceTransactionDocument,
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
    currentPlan: {
      type: String,
      enum: ['FREE', 'BASIC', 'PRO', 'PREMIUM'],
      default: 'FREE',
    },
    maxTeams: { type: Number, default: 1 },
  },
  { timestamps: true },
);

const TeamSchema = new Schema<ITeamDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    teamName: { type: String, required: true },
    ageGroup: { type: String, required: true },
    coachesCount: { type: Number, default: 0 },
    playersCount: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 },
    coachIds: [{ type: Schema.Types.ObjectId, ref: 'CoachProfile' }],
    playerIds: [{ type: Schema.Types.ObjectId, ref: 'PlayerProfile' }],
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
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: false, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    evaluationDate: { type: Date, default: Date.now },
    overallRating: { type: Number },
    technicalScore: { type: Number },
    physicalScore: { type: Number },
    mentalScore: { type: Number },
    techniques: {
      type: Map,
      of: String,
      default: {},
    },
    characteristics: {
      type: Map,
      of: String,
      default: {},
    },
    physical: {
      type: Map,
      of: String,
      default: {},
    },
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

const TransferRequestSchema = new Schema<ITransferRequestDocument>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    fromAcademyId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademyProfile',
      required: true,
      index: true,
    },
    toAcademyId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademyProfile',
      required: true,
      index: true,
    },
    fromTeamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    toTeamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    transferType: {
      type: String,
      enum: ['OUTGOING', 'INCOMING'],
      required: true,
    },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByCoachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    requestedByRole: { type: String, default: 'ACADEMY' },
    requesterName: { type: String },
    reason: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    responseNote: { type: String },
    respondedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

TransferRequestSchema.index({ fromAcademyId: 1, status: 1 });
TransferRequestSchema.index({ toAcademyId: 1, status: 1 });
TransferRequestSchema.index({ playerId: 1, status: 1 });

export const TransferRequest = model<ITransferRequestDocument>(
  'TransferRequest',
  TransferRequestSchema,
);

// ==========================================
// FEES & PAYMENTS SCHEMA (SCREENSHOT 1)
// ==========================================
const AcademyFeePaymentSchema = new Schema<IAcademyFeePaymentDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile' },
    feeType: { type: String, required: true, default: 'Monthly Fee' },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['PAID', 'UNPAID', 'PENDING'],
      default: 'PAID',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'STRIPE', 'BANK_TRANSFER', 'OTHER'],
      default: 'CASH',
    },
    transactionId: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

AcademyFeePaymentSchema.index({ academyId: 1, paymentDate: -1 });

export const AcademyFeePayment = model<IAcademyFeePaymentDocument>(
  'AcademyFeePayment',
  AcademyFeePaymentSchema,
);

// ==========================================
// FINANCE COMMITTEE SCHEMA (SCREENSHOT 2)
// ==========================================
const AcademyFinanceTransactionSchema = new Schema<IAcademyFinanceTransactionDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    reportId: { type: Schema.Types.ObjectId, ref: 'GameReport' },
    validationId: { type: Schema.Types.ObjectId, ref: 'PlayerCvValidation' },
    transactionType: { type: String, required: true, default: 'Game Report' },
    cost: { type: Number, required: true },
    commissionAcademy: { type: Number, required: true },
    transactionDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'REJECTED'],
      default: 'COMPLETED',
      index: true,
    },
    notes: { type: String },
  },
  { timestamps: true },
);

AcademyFinanceTransactionSchema.index({ academyId: 1, transactionDate: -1 });

export const AcademyFinanceTransaction = model<IAcademyFinanceTransactionDocument>(
  'AcademyFinanceTransaction',
  AcademyFinanceTransactionSchema,
);
