import { Schema, model } from 'mongoose';
import {
  IAgentProfileDocument,
  IVerificationDocumentDocument,
  ISuccessStoryDocument,
} from './agent.interface';

const AgentProfileSchema = new Schema<IAgentProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    licenseId: { type: String },
    certifications: { type: String },
    verificationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
    },
    cvsSharedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const VerificationDocumentSchema = new Schema<IVerificationDocumentDocument>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: {
      type: String,
      enum: ['LICENSE_CERTIFICATE', 'NATIONAL_ID_PASSPORT', 'ASSOCIATION_MEMBERSHIP'],
      required: true,
    },
    fileUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
    },
  },
  { timestamps: true },
);

const SuccessStorySchema = new Schema<ISuccessStoryDocument>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storyTitle: { type: String, required: true },
    category: {
      type: String,
      enum: ['TRANSFER_ACHIEVEMENT', 'SIGNING_ACHIEVEMENT', 'AGENT_MILESTONE'],
      required: true,
    },
    image: { type: String },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'APPROVED',
    },
  },
  { timestamps: true },
);

export const AgentProfile = model<IAgentProfileDocument>('AgentProfile', AgentProfileSchema);
export const VerificationDocument = model<IVerificationDocumentDocument>(
  'VerificationDocument',
  VerificationDocumentSchema,
);
export const SuccessStory = model<ISuccessStoryDocument>('SuccessStory', SuccessStorySchema);
