import { Document, Types } from 'mongoose';

export type PolicyType =
  'TERMS_AND_CONDITIONS' | 'PRIVACY_POLICY' | 'MEDIA_CONSENT' | 'COOKIE_POLICY' | string;

export interface ILegalPolicy {
  type: PolicyType;
  title: string;
  slug: string;
  content: string;
  version: string;
  isMajorUpdate: boolean;
  isCurrent: boolean;
  isPublished: boolean;
  effectiveDate: Date;
  summaryOfChanges?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILegalPolicyDocument extends ILegalPolicy, Document {}
