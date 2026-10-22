import { Document, Types } from 'mongoose';

export type CoachType = 'INDIVIDUAL_COACH' | 'CLUB_COACH';
export type CoachStatus = 'AVAILABLE' | 'CONTRACTED' | 'ACTIVE' | 'INACTIVE';
export type CvTier = 'BRONZE' | 'SILVER' | 'GOLD';

export type CoachingLicenseLevel =
  | 'UEFA Pro License'
  | 'UEFA A License'
  | 'UEFA B License'
  | 'AFC/BFF A or B License'
  | 'Grassroots / C License'
  | 'No Official License';

export type PreferredFormation =
  | '4-3-3 (Attack-focused)'
  | '3-5-2 (Wingbacks control)'
  | '4-4-2 (Standard flat)'
  | '4-2-3-1 (Modern possession)';

export interface ICoachTransferStatus {
  footballAgentContract?: string; // 'Yes' | 'No'
  contractUntil?: string; // e.g. 'June, 2026'
  agent?: string; // 'John Morris...'
  agency?: string; // 'Elite Sports...'
  salary?: string; // '$ 20,000.00'
  statusBadge?: string; // 'Active'
}

export interface ICoachAccomplishment {
  _id?: Types.ObjectId;
  title?: string;
  text: string;
  date?: string;
}

export interface ICoachLanguage {
  _id?: Types.ObjectId;
  language: string;
  proficiency?: 'NATIVE' | 'FLUENT' | 'INTERMEDIATE' | 'BASIC';
}

export interface ICoachTrophy {
  _id?: Types.ObjectId;
  title: string;
  count: number;
  year?: number;
}

export interface ICoachCupPlayed {
  _id?: Types.ObjectId;
  year: number;
  tournament: string;
  club?: string;
}

export interface ICoachSkill {
  _id?: Types.ObjectId;
  name: string;
  icon?: string;
  isCustom?: boolean;
}

export interface ICoachClubHistory {
  _id?: Types.ObjectId;
  clubName: string;
  role?: string;
  period: string; // e.g. '2020 - Present'
  startYear?: number;
  endYear?: number;
  isCurrent?: boolean;
  logoUrl?: string;
}

export interface ICoachAssociation {
  _id?: Types.ObjectId;
  name: string;
  code?: string; // CAF, CONCACAF, DFB, UEFA, FIFA, CBF, The FA, RFEF, FFF
  logoUrl?: string;
  isSelected?: boolean;
}

export interface ICoachCourse {
  _id?: Types.ObjectId;
  name: string;
  category?: string;
  issueDate?: string;
  certificateUrl?: string;
  isCompleted?: boolean;
  isSelected?: boolean;
}

export interface ICoachDocument {
  _id?: Types.ObjectId;
  title: string;
  fileUrl: string;
  fileType?: string;
  uploadedAt?: Date;
}

export interface ICoachProfile {
  userId: Types.ObjectId;
  coachType: CoachType;
  fullName: string;
  title: string;
  yearsExperience: number;
  overallRatingScore: number;
  licenseStatus: string;
  cvTier: CvTier;
  profileCompletion?: number;
  completionPercentage?: number;
  speciality: string;
  status: CoachStatus;
  additionalNotes?: string;

  // Personal Info & Hero
  profileImage?: string;
  coverImage?: string;
  dateOfBirth?: Date | string;
  age?: number;
  birthCountry?: string;
  birthCountryFlag?: string;
  dualNationality?: string;
  dualNationalityFlag?: string;
  currentClub?: string;
  clubLogo?: string;
  academyId?: Types.ObjectId;
  isVerifiedByAcademy?: boolean;
  academyRole?: string;
  website?: string;
  phone?: string;
  email?: string;
  location?: string;

  // Validation Status
  validationStatus?: string;
  revalidationRequested?: boolean;
  revalidationRequestedAt?: Date;

  // Season Stats
  matchesCoached: number;
  totalWins: number;
  losses: number;
  draws: number;
  cleanSheets: number;

  // Transfer Status
  transferStatus?: ICoachTransferStatus;

  // Sections
  accomplishments?: ICoachAccomplishment[];
  coachStyles?: string[];
  languages?: ICoachLanguage[];
  majorTrophies?: ICoachTrophy[];
  cupsPlayed?: ICoachCupPlayed[];
  keySkills?: ICoachSkill[];
  clubHistory?: ICoachClubHistory[];
  associations?: ICoachAssociation[];
  courses?: ICoachCourse[];
  documents?: ICoachDocument[];

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICoachProfileDocument extends ICoachProfile, Document {}

export interface ITacticalFormation {
  coachId: Types.ObjectId;
  formationSlot: number; // 1, 2, 3
  formationName: string; // e.g. "4-3-3", "4-2-3-1"
  positionsJson: string; // Dynamic coordinates JSON or token pins
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
