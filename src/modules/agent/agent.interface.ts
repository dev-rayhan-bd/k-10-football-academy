import { Document, Types } from 'mongoose';

export type AgentVerificationStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export type VerificationDocType =
  'LICENSE_CERTIFICATE' | 'NATIONAL_ID_PASSPORT' | 'ASSOCIATION_MEMBERSHIP';

export enum StoryCategoryEnum {
  TRANSFER_ACHIEVEMENT = 'Transfer Achievement',
  SIGNING_ACHIEVEMENT = 'Signing Achievement',
  AGENT_MILESTONE = 'Agent Milestone',
  ACADEMY_MILESTONE = 'Academy Milestone',
}

export enum SignedClubAchievementEnum {
  BENFICA_TRIAL_SECURED = 'Benfica Academy - Trial Secured',
  CHELSEA_CONTRACT_SIGNED = 'Chelsea Youth - Contract Signed',
}

export const STORY_CATEGORIES = [
  'Transfer Achievement',
  'Signing Achievement',
  'Agent Milestone',
  'Academy Milestone',
  'TRANSFER_ACHIEVEMENT',
  'SIGNING_ACHIEVEMENT',
  'AGENT_MILESTONE',
  'ACADEMY_MILESTONE',
] as const;

export const SIGNED_CLUB_ACHIEVEMENTS = [
  'Benfica Academy - Trial Secured',
  'Chelsea Youth - Contract Signed',
] as const;

export type StoryCategory =
  | 'Transfer Achievement'
  | 'Signing Achievement'
  | 'Agent Milestone'
  | 'Academy Milestone'
  | 'TRANSFER_ACHIEVEMENT'
  | 'SIGNING_ACHIEVEMENT'
  | 'AGENT_MILESTONE'
  | 'ACADEMY_MILESTONE';

export type SignedClubAchievement =
  'Benfica Academy - Trial Secured' | 'Chelsea Youth - Contract Signed' | string;

export interface IAgentProfile {
  userId: Types.ObjectId;
  fullName?: string;
  name?: string;
  nationality?: string;
  country?: string;
  licenseId?: string;
  fifaLicenseNumber?: string;
  dateOfBirth?: Date;
  age?: number;
  contact?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  coverPhoto?: string;
  yearsOfExperience?: number;
  certifications?: string;
  achievements?: string;
  bio?: string;
  professionalBio?: string;
  agencyName?: string;
  officialWebsite?: string;
  countryOfOperation?: string;
  licenseCertificateDocument?: string;
  identityDocument?: string;
  associationMembershipDocument?: string;
  verificationStatus: AgentVerificationStatus;
  adminReviewNotes?: string;
  verifiedAt?: Date;
  cvsSharedCount: number;
  profileCompletion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentProfileDocument extends IAgentProfile, Document {}

export interface IVerificationDocument {
  agentId: Types.ObjectId;
  documentType: VerificationDocType;
  fileUrl: string;
  status: AgentVerificationStatus;
  adminReviewNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IVerificationDocumentDocument extends IVerificationDocument, Document {}

export interface ISuccessStory {
  creatorId: Types.ObjectId;
  creatorRole?: string;
  storyTitle: string;
  category: StoryCategory | string;
  playerName?: string;
  position?: string;
  previousAcademy?: string;
  date?: Date;
  formattedDate?: string;
  signedClub?: SignedClubAchievement;
  image?: string;
  storyContent?: string;
  status: AgentVerificationStatus;
  adminReviewNotes?: string;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISuccessStoryDocument extends ISuccessStory, Document {}
