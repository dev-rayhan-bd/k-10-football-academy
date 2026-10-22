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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyProfileDocument extends IAcademyProfile, Document {}

export interface ITeam {
  academyId: Types.ObjectId;
  teamName: string;
  ageGroup: string; // e.g. "UNDER_15", "UNDER_17"
  coachesCount: number;
  playersCount: number;
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
