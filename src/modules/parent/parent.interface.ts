import { Document, Types } from 'mongoose';

export type RelationshipType = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';

export function normalizeRelationshipType(val?: string): RelationshipType {
  if (!val) return 'PARENT';
  const clean = String(val).trim().toUpperCase();
  if (clean === 'FATHER' || clean === 'DAD') return 'FATHER';
  if (clean === 'MOTHER' || clean === 'MOM') return 'MOTHER';
  if (clean === 'GUARDIAN') return 'GUARDIAN';
  if (clean === 'PARENT') return 'PARENT';
  return 'PARENT';
}

export type CoachReviewStatus =
  'PENDING' | 'EVALUATED' | 'UNREQUESTED' | 'AWAITING_PAYMENT' | 'REJECTED';

export interface IParentProfile {
  userId: Types.ObjectId;
  contactPhone: string;
  alternatePhone?: string;
  firstName?: string;
  lastName?: string;
  relationship?: string;
  occupation?: string;
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  notes?: string;
  academyId?: Types.ObjectId;
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
  coachId?: Types.ObjectId;
  opponentTeam: string;
  matchDate: Date;
  plottedEventsJson?: string;
  plottedCount?: number;
  coachReviewStatus: CoachReviewStatus;
  coachReviewPrice?: number;
  coachRating?: number;
  paymentStatus?: 'UNPAID' | 'PAID' | 'FREE';
  transactionId?: string;
  checkoutUrl?: string | null;
  paidAt?: Date;
  createdAt?: Date;
}

export interface IParentMatchReportDocument extends IParentMatchReport, Document {}
