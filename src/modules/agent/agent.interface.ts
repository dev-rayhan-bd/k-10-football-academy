import { Document, Types } from 'mongoose';

export type AgentVerificationStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export type VerificationDocType =
  'LICENSE_CERTIFICATE' | 'NATIONAL_ID_PASSPORT' | 'ASSOCIATION_MEMBERSHIP';
export type StoryCategory = 'TRANSFER_ACHIEVEMENT' | 'SIGNING_ACHIEVEMENT' | 'AGENT_MILESTONE';

export interface IAgentProfile {
  userId: Types.ObjectId;
  licenseId?: string;
  certifications?: string;
  verificationStatus: AgentVerificationStatus;
  cvsSharedCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentProfileDocument extends IAgentProfile, Document {}

export interface IVerificationDocument {
  agentId: Types.ObjectId;
  documentType: VerificationDocType;
  fileUrl: string;
  status: AgentVerificationStatus;
  createdAt?: Date;
}

export interface IVerificationDocumentDocument extends IVerificationDocument, Document {}

export interface ISuccessStory {
  creatorId: Types.ObjectId;
  storyTitle: string;
  category: StoryCategory;
  image?: string;
  status: AgentVerificationStatus;
  createdAt?: Date;
}

export interface ISuccessStoryDocument extends ISuccessStory, Document {}
