import { Document, Types } from 'mongoose';

export type RelationshipType = 'FATHER' | 'MOTHER' | 'GUARDIAN';
export type CoachReviewStatus = 'PENDING' | 'EVALUATED' | 'UNREQUESTED';

export interface IParentProfile {
  userId: Types.ObjectId;
  contactPhone: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IParentProfileDocument extends IParentProfile, Document {}

export interface IParentChild {
  parentId: Types.ObjectId;
  childPlayerId: Types.ObjectId;
  relationshipType: RelationshipType;
  createdAt?: Date;
}

export interface IParentChildDocument extends IParentChild, Document {}

export interface IParentMatchReport {
  parentId: Types.ObjectId;
  childPlayerId: Types.ObjectId;
  opponentTeam: string;
  matchDate: Date;
  plottedEventsJson?: string;
  coachReviewStatus: CoachReviewStatus;
  coachReviewPrice?: number;
  coachRating?: number;
  createdAt?: Date;
}

export interface IParentMatchReportDocument extends IParentMatchReport, Document {}
