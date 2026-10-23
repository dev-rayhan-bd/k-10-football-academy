import { Document, Types } from 'mongoose';

export type EvaluationStatus = 'EVALUATED' | 'NEED_EVALUATION' | 'EXPIRED' | 'OVERDUE';
export type ReportPaymentStatus = 'PAID' | 'PENDING' | 'UNPAID';
export type ReportStatus = 'PENDING' | 'COMPLETED' | 'APPROVED';

export interface IAcademyProfile {
  userId: Types.ObjectId;
  name: string;
  category: string;
  establishedDate?: Date;
  country: string;
  city: string;
  location?: string;
  registrationId?: string;
  estimatedAcademySize?: string;
  logo?: string;
  coverPhoto?: string;
  description?: string;
  visionAndMission?: string;
  trainingPhilosophy?: string;
  currentPlan?: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
  maxTeams?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyProfileDocument extends IAcademyProfile, Document {}

export interface ITeam {
  academyId: Types.ObjectId;
  teamName: string;
  ageGroup: string; // e.g. "UNDER_15", "UNDER_17", "Santos U17"
  coachesCount: number;
  playersCount: number;
  totalMembers?: number;
  coachIds?: Types.ObjectId[];
  playerIds?: Types.ObjectId[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeamDocument extends ITeam, Document {}

export interface IGameReport {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId?: Types.ObjectId;
  scoutName?: string;
  matchName: string;
  matchDate: Date;
  overallPerformanceScore: number;
  goals: number;
  assists: number;
  passes: number;
  price: number;
  paymentStatus: ReportPaymentStatus;
  status: ReportStatus;
  createdAt?: Date;
}

export interface IGameReportDocument extends IGameReport, Document {}

export interface IPlayerEvaluationTechniques {
  dribbling?: string;
  ballMastery?: string;
  runningWithBall?: string;
  rangeOfPassing?: string;
  strikingFinishing?: string;
  defending?: string;
  firstTouch?: string;
  nonDominantFoot?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluationCharacteristics {
  gameAwareness?: string;
  gamesUnderstanding?: string;
  decisionMaking?: string;
  concentration?: string;
  leadership?: string;
  desire?: string;
  maturity?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluationPhysical {
  speedAcceleration?: string;
  movement?: string;
  balance?: string;
  power?: string;
  strength?: string;
  agility?: string;
  coordination?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluation {
  academyId?: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId: Types.ObjectId;
  evaluationDate?: Date;
  overallRating?: number;
  technicalScore?: number;
  physicalScore?: number;
  mentalScore?: number;
  techniques?: IPlayerEvaluationTechniques;
  characteristics?: IPlayerEvaluationCharacteristics;
  physical?: IPlayerEvaluationPhysical;
  improvementDelta?: number;
  status: EvaluationStatus;
  nextEvaluationDue?: Date;
  expiresAt?: Date;
  requestedByManagerId?: Types.ObjectId;
  reminderSentAt?: Date;
  reminderCount?: number;
  coachFeedback?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlayerEvaluationDocument extends IPlayerEvaluation, Document {}

export type AcademyAffiliationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
export type AffiliationInitiator = 'ACADEMY' | 'COACH';

export interface IAcademyCoach {
  academyId: Types.ObjectId;
  coachId: Types.ObjectId;
  coachUserId: Types.ObjectId;
  role: string;
  status: AcademyAffiliationStatus;
  requestedBy: AffiliationInitiator;
  requestMessage?: string;
  responseNote?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyCoachDocument extends IAcademyCoach, Document {}

export type TransferType = 'OUTGOING' | 'INCOMING';
export type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ITransferRequest {
  playerId: Types.ObjectId;
  fromAcademyId: Types.ObjectId;
  toAcademyId: Types.ObjectId;
  fromTeamId?: Types.ObjectId;
  toTeamId?: Types.ObjectId;
  transferType: TransferType;
  requestedByUserId: Types.ObjectId;
  requestedByCoachId?: Types.ObjectId;
  requestedByRole: string;
  requesterName?: string;
  reason?: string;
  status: TransferStatus;
  responseNote?: string;
  respondedByUserId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITransferRequestDocument extends ITransferRequest, Document {}

// ==========================================
// FEES & PAYMENTS INTERFACE (SCREENSHOT 1)
// ==========================================
export type FeePaymentType =
  | 'Monthly Fee'
  | 'Training Session Fee'
  | 'Validation Fee'
  | 'Weekly Fee'
  | 'Uniform Kit Fee'
  | string;

export type FeePaymentStatus = 'PAID' | 'UNPAID' | 'PENDING';

export interface IAcademyFeePayment {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  parentId?: Types.ObjectId;
  feeType: FeePaymentType;
  amount: number;
  paymentDate: Date;
  status: FeePaymentStatus;
  paymentMethod?: 'CASH' | 'CARD' | 'STRIPE' | 'BANK_TRANSFER' | 'OTHER';
  transactionId?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyFeePaymentDocument extends IAcademyFeePayment, Document {}

// ==========================================
// FINANCE COMMITTEE INTERFACE (SCREENSHOT 2)
// ==========================================
export type FinanceTransactionType = 'Game Report' | 'CV Validation' | 'Commission' | string;
export type FinanceTransactionStatus = 'COMPLETED' | 'PENDING' | 'REJECTED';

export interface IAcademyFinanceTransaction {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId?: Types.ObjectId;
  reportId?: Types.ObjectId;
  validationId?: Types.ObjectId;
  transactionType: FinanceTransactionType;
  cost: number;
  commissionAcademy: number;
  transactionDate: Date;
  status: FinanceTransactionStatus;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyFinanceTransactionDocument extends IAcademyFinanceTransaction, Document {}
