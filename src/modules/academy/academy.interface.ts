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

export interface IPlayerEvaluation {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId: Types.ObjectId;
  evaluationDate: Date;
  overallRating: number;
  technicalScore: number;
  physicalScore: number;
  mentalScore: number;
  improvementDelta: number;
  status: EvaluationStatus;
  createdAt?: Date;
}

export interface IPlayerEvaluationDocument extends IPlayerEvaluation, Document {}
