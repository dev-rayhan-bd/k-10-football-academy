import { Document, Types } from 'mongoose';

export type CoachType = 'INDIVIDUAL_COACH' | 'CLUB_COACH';
export type CoachStatus = 'AVAILABLE' | 'CONTRACTED' | 'ACTIVE' | 'INACTIVE';
export type CvTier = 'BRONZE' | 'SILVER' | 'GOLD';

export interface ICoachProfile {
  userId: Types.ObjectId;
  coachType: CoachType;
  fullName: string;
  title: string;
  yearsExperience: number;
  overallRatingScore: number;
  licenseStatus: string;
  cvTier: CvTier;
  speciality: string;
  status: CoachStatus;
  additionalNotes?: string;
  matchesCoached: number;
  totalWins: number;
  losses: number;
  draws: number;
  cleanSheets: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICoachProfileDocument extends ICoachProfile, Document {}

export interface ITacticalFormation {
  coachId: Types.ObjectId;
  formationSlot: number; // 1, 2, 3
  formationName: string; // e.g. "4-3-3", "4-2-3-1"
  positionsJson: string; // Dynamic coordinates JSON
}

export interface ITacticalFormationDocument extends ITacticalFormation, Document {}

export interface ICoachTestimonial {
  coachId: Types.ObjectId;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  rating: number;
  comment: string;
  createdAt?: Date;
}

export interface ICoachTestimonialDocument extends ICoachTestimonial, Document {}
